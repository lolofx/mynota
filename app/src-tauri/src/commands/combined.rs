//! One report for several summary tabs (ADR 0024): the model reads the
//! transcript once and writes every requested section, which is then split
//! into one summary per tab. The same format goes to an outside assistant and
//! comes back through [`import_combined_report`].

use tauri::{AppHandle, Manager, State};
use time::OffsetDateTime;

use myna_llm::{resolve, SummaryInstructions, Template};

use crate::combined_report::{
    compose_prompt, external_request, parse_sections, skill_instruction, SectionSpec,
    COMBINED_TEMPLATE_NAME,
};
use crate::commands::summary::{
    build_render_context, emit_done, infer_markdown, load_general_guidelines, load_template,
    parse_meeting_id, resolve_instructions, SummarizerReleaseGuard,
};
use crate::domain::{Meeting, MeetingId, Summary, SummaryRef};
use crate::dto::{CombinedResultDto, SummarizeInstructionsDto, SummaryDto};
use crate::error::AppError;
use crate::paths;
use crate::state::{guard_summary_vs_import, ActiveSummary, AppState};
use crate::store::MeetingStore;

/// Most tabs one report can fill.
const MAX_SECTIONS: usize = 8;

/// The sections for `names`: what each tab must contain is its skill, the
/// effective prompt of its template (the user's edit included), so a template
/// the user wrote takes part too.
fn section_specs(app: &AppHandle, names: &[String]) -> Result<Vec<SectionSpec>, AppError> {
    let unique = unique_names(names)?;
    unique
        .into_iter()
        .map(|name| {
            let template = load_template(app, &name)?;
            Ok(SectionSpec {
                label: template.label.clone().unwrap_or_else(|| name.clone()),
                instruction: skill_instruction(&template.prompt),
                name,
            })
        })
        .collect()
}

/// `names` without repeats, in order; an empty or oversized list is refused.
fn unique_names(names: &[String]) -> Result<Vec<String>, AppError> {
    let mut unique: Vec<String> = Vec::new();
    for name in names {
        if !unique.contains(name) {
            unique.push(name.clone());
        }
    }
    if unique.is_empty() {
        return Err(AppError::Store("choose at least one summary".to_string()));
    }
    if unique.len() > MAX_SECTIONS {
        return Err(AppError::Store(format!(
            "a report can fill at most {MAX_SECTIONS} summaries at once"
        )));
    }
    Ok(unique)
}

/// The prompt template of a combined run over `specs`.
fn combined_template(specs: &[SectionSpec]) -> Result<Template, AppError> {
    let template = Template {
        name: COMBINED_TEMPLATE_NAME.to_string(),
        description: "One report for several summaries.".to_string(),
        prompt: compose_prompt(specs),
        label: None,
        emoji: None,
        section_schema: None,
    };
    template.validate()?;
    Ok(template)
}

fn instructions_for(
    instructions: Option<&SummarizeInstructionsDto>,
) -> Result<Option<SummaryInstructions>, AppError> {
    Ok(resolve_instructions(
        &load_general_guidelines()?,
        instructions,
    ))
}

/// Generates several summaries with one read of the transcript: the chosen
/// tabs are filled from a single model run. Resolves with what was saved and
/// the tabs the model left out.
#[tauri::command]
pub async fn summarize_combined(
    app: AppHandle,
    meeting_id: String,
    templates: Vec<String>,
    language: Option<String>,
    instructions: Option<SummarizeInstructionsDto>,
) -> Result<CombinedResultDto, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    let state = app.state::<AppState>();
    guard_summary_vs_import(state.import_busy())?;
    let _guard = state.summarization_guard()?;
    let names = unique_names(&templates)?;
    let (language_code, _) = resolve(language.as_deref());
    let _active = state.begin_active_summary(ActiveSummary {
        meeting_id: meeting_id.clone(),
        template: COMBINED_TEMPLATE_NAME.to_string(),
        language: language_code.to_string(),
        templates: names.clone(),
    });

    let app_for_worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_for_worker.state::<AppState>();
        let _release = SummarizerReleaseGuard { state: &state };
        run_combined(&app_for_worker, &state, id, &names, language, instructions)
    })
    .await
    .unwrap_or_else(|_| {
        Err(AppError::Store(
            "summarization worker thread panicked".to_string(),
        ))
    })
}

fn run_combined(
    app: &AppHandle,
    state: &State<'_, AppState>,
    id: MeetingId,
    names: &[String],
    language: Option<String>,
    instructions: Option<SummarizeInstructionsDto>,
) -> Result<CombinedResultDto, AppError> {
    let (language_code, language_label) = resolve(language.as_deref());
    let meeting = state.store.get(id)?;
    let specs = section_specs(app, names)?;
    let template = combined_template(&specs)?;
    let ctx = build_render_context(
        &meeting,
        language_label,
        instructions_for(instructions.as_ref())?,
    )?;
    let markdown = infer_markdown(app, state, &id, COMBINED_TEMPLATE_NAME, &template, &ctx)?;
    land_report(app, state, meeting, &markdown, language_code, names)
}

/// The prompt of a combined report with the transcript inside, as one
/// Markdown text to give to an assistant outside the app. Nothing is sent by
/// the app: the text moves only when the user copies it.
#[tauri::command]
pub async fn build_external_prompt(
    app: AppHandle,
    meeting_id: String,
    templates: Vec<String>,
    language: Option<String>,
    instructions: Option<SummarizeInstructionsDto>,
) -> Result<String, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let meeting = state.store.get(id)?;
        let specs = section_specs(&app, &templates)?;
        let template = combined_template(&specs)?;
        let (_, language_label) = resolve(language.as_deref());
        let ctx = build_render_context(
            &meeting,
            language_label,
            instructions_for(instructions.as_ref())?,
        )?;
        Ok(external_request(&template.render(&ctx)))
    })
    .await
    .unwrap_or_else(|_| {
        Err(AppError::Store(
            "build_external_prompt worker thread panicked".to_string(),
        ))
    })
}

/// Splits a report (pasted from an outside assistant) into one summary per
/// tab. A section whose name is not a known template is reported, not saved.
#[tauri::command]
pub async fn import_combined_report(
    app: AppHandle,
    meeting_id: String,
    language: Option<String>,
    text: String,
) -> Result<CombinedResultDto, AppError> {
    let id = parse_meeting_id(&meeting_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (language_code, _) = resolve(language.as_deref());
        let meeting = state.store.get(id)?;
        let known: Vec<String> = myna_llm::list_templates(&paths::templates_root(&app))?
            .into_iter()
            .map(|template| template.name)
            .collect();
        land_report(&app, &state, meeting, &text, language_code, &known)
    })
    .await
    .unwrap_or_else(|_| {
        Err(AppError::Store(
            "import_combined_report worker thread panicked".to_string(),
        ))
    })
}

/// Saves the sections of `report` named in `wanted` as summaries of
/// `meeting`; fails when none of them is there.
fn land_report(
    app: &AppHandle,
    state: &State<'_, AppState>,
    meeting: Meeting,
    report: &str,
    language_code: &str,
    wanted: &[String],
) -> Result<CombinedResultDto, AppError> {
    let parsed = parse_sections(report);
    let id = meeting.id;
    let mut updated = meeting;
    let mut saved: Vec<SummaryDto> = Vec::new();
    let mut ignored: Vec<String> = Vec::new();
    for (name, body) in parsed.sections {
        if !wanted.contains(&name) {
            ignored.push(name);
            continue;
        }
        let created_at = OffsetDateTime::now_utc();
        let path = state.store.save_summary(id, &name, language_code, &body)?;
        updated = updated.with_summary(SummaryRef {
            template: name.clone(),
            created_at,
            path,
            language: language_code.to_string(),
            stale: false,
        });
        emit_done(app, &id.to_string(), &name, language_code, &body);
        saved.push(SummaryDto::from(Summary {
            template: name,
            markdown: body,
            created_at,
            language: language_code.to_string(),
        }));
    }
    if saved.is_empty() {
        return Err(AppError::Store(
            "no section of the expected format (### SECTION: name) was found".to_string(),
        ));
    }
    state.store.save(&updated)?;
    crate::auto_export::after_save(state.store.as_ref(), id);

    let missing = wanted
        .iter()
        .filter(|name| !saved.iter().any(|summary| &summary.template == *name))
        .cloned()
        .collect();
    Ok(CombinedResultDto {
        saved,
        missing,
        ignored,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn repeated_names_are_listed_once_in_their_first_position() {
        let unique = unique_names(&names(&["decisions", "key-points", "decisions"])).expect("ok");

        assert_eq!(unique, names(&["decisions", "key-points"]));
    }

    #[test]
    fn an_empty_choice_is_refused() {
        assert!(matches!(unique_names(&[]), Err(AppError::Store(_))));
    }

    #[test]
    fn too_many_tabs_are_refused() {
        let many: Vec<String> = (0..=MAX_SECTIONS).map(|n| format!("t{n}")).collect();

        assert!(matches!(unique_names(&many), Err(AppError::Store(_))));
    }

    #[test]
    fn the_combined_template_is_valid_for_the_built_in_sections() {
        let specs = vec![
            SectionSpec {
                name: "key-points".into(),
                label: "Key Points".into(),
                instruction: "Extract the key points discussed in the meeting.".into(),
            },
            SectionSpec {
                name: "decisions".into(),
                label: "Decisions".into(),
                instruction: "Extract the decisions that were made, with the reasoning.".into(),
            },
        ];

        let template = combined_template(&specs).expect("valid template");

        assert_eq!(template.name, COMBINED_TEMPLATE_NAME);
    }
}
