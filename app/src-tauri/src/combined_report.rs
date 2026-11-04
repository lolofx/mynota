//! One report for several summary tabs: the model reads the transcript once
//! and writes every requested section, in a format simple enough for a small
//! local model to follow and for the app to split back into one summary per
//! tab.
//!
//! The same format serves an outside assistant (Claude Code, a chat): the app
//! hands over the transcript and the instructions in one Markdown text, and
//! the answer is pasted back and split the same way.
//!
//! ```text
//! ### SECTION: key-points
//! - first point
//!
//! ### SECTION: decisions
//! - first decision
//! ```
//!
//! Everything here is pure text work: no model, no I/O.

/// A tab the report has to fill: the template's name (the section id), its
/// label, and what the section must contain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SectionSpec {
    pub name: String,
    pub label: String,
    pub instruction: String,
}

/// The sections found in a report, in the order they appear.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedReport {
    pub sections: Vec<(String, String)>,
}

/// Name of the prompt template built for a combined run.
pub const COMBINED_TEMPLATE_NAME: &str = "combined";

/// Placeholders an instruction may keep: they are filled when the prompt is
/// rendered. Any other `{token}` would be rejected by the template engine.
const KEPT_PLACEHOLDERS: [&str; 3] = ["{title}", "{duration}", "{language}"];

/// `text` with every `{token}` that is not in [`KEPT_PLACEHOLDERS`] stripped
/// of its braces.
fn without_unknown_tokens(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open..];
        match after.find('}') {
            Some(close) => {
                let token = &after[..=close];
                if KEPT_PLACEHOLDERS.contains(&token) {
                    out.push_str(token);
                } else {
                    out.push_str(&token[1..token.len() - 1]);
                }
                rest = &after[close + 1..];
            }
            None => {
                out.push_str(&after[1..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// What a skill (a summary template) asks for, taken from its prompt: the
/// text before the transcript, without the trailing `Transcript:` label. This
/// is what the user edits in Settings, so an edited skill is what the
/// combined report asks for too.
pub fn skill_instruction(prompt: &str) -> String {
    let head = prompt.split("{transcript}").next().unwrap_or(prompt).trim();
    let lower = head.to_lowercase();
    let head = if lower.ends_with("transcript:") {
        head[..head.len() - "transcript:".len()].trim_end()
    } else {
        head
    };
    without_unknown_tokens(head)
}

/// The prompt of a combined run, with the usual `{title}`, `{duration}`,
/// `{transcript}` and `{language}` placeholders, ready to be wrapped in a
/// template. `sections` must not be empty.
pub fn compose_prompt(sections: &[SectionSpec]) -> String {
    let mut prompt = String::from(
        "You are writing the report of a meeting titled \"{title}\" that lasted {duration}. \
         Read the transcript once, then write every section listed below. Be faithful to the \
         transcript and do not invent anything that was not said. In the transcript, 'Me:' \
         lines are the user, 'Others:' are remote participants, and unprefixed lines are \
         unattributed. The text may also be partial reports in the format below, from earlier \
         parts of the same meeting: then merge the sections that have the same name.\n\n\
         Sections to write, each with the instructions of its own skill:\n",
    );
    for section in sections {
        prompt.push_str(&format!(
            "\nSection `{}`:\n{}\n",
            section.name,
            without_unknown_tokens(section.instruction.trim())
        ));
    }
    prompt.push_str(
        "\nOutput format. Start each section with a line made of exactly `### SECTION: ` \
         followed by its name as listed above, then write its content in Markdown. Write all \
         the sections, in the order listed, and nothing before the first line or after the \
         last section. Example:\n\n",
    );
    for section in sections.iter().take(2) {
        prompt.push_str(&format!(
            "### SECTION: {}\n(the content of this section)\n\n",
            section.name
        ));
    }
    prompt.push_str(
        "Transcript:\n{transcript}\n\nWrite the content of every section in {language}; the \
         `### SECTION:` lines and the names stay exactly as shown.\n\nReport:",
    );
    prompt
}

/// Wraps an already rendered prompt (transcript included) for an assistant
/// outside the app: says what the answer must look like so it can be pasted
/// into Mynota unchanged.
pub fn external_request(rendered_prompt: &str) -> String {
    format!(
        "# Meeting report request (Mynota)\n\n\
         This file holds everything needed: the instructions and the meeting transcript. \
         Reply with the report only, in the exact format described below, with no \
         introduction and no closing remark, so that it can be pasted back into Mynota and \
         split into one summary per tab.\n\n---\n\n{rendered_prompt}\n"
    )
}

/// The section name announced by a marker line (`### SECTION: key-points`),
/// or `None` when `line` is not a marker. Forgiving about what models do to
/// it: any heading depth or none, bold or backticks around it, any case,
/// `:` or `-` after `SECTION`.
fn marker_name(line: &str) -> Option<String> {
    let cleaned = line
        .trim()
        .trim_start_matches('#')
        .trim()
        .trim_matches(|c| c == '*' || c == '`')
        .trim();
    let lower = cleaned.to_lowercase();
    let rest = lower.strip_prefix("section")?;
    let rest = rest.trim_start();
    let rest = rest
        .strip_prefix(':')
        .or_else(|| rest.strip_prefix('-'))?
        .trim()
        .trim_matches(|c| c == '*' || c == '`')
        .trim();
    let valid = !rest.is_empty()
        && rest
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    valid.then(|| rest.to_string())
}

/// Splits `text` into sections at its marker lines. Whatever comes before the
/// first marker is dropped; a section repeated keeps its first occurrence;
/// empty sections are kept out.
pub fn parse_sections(text: &str) -> ParsedReport {
    let mut sections: Vec<(String, String)> = Vec::new();
    let mut current: Option<(String, Vec<&str>)> = None;
    let finish = |current: Option<(String, Vec<&str>)>, sections: &mut Vec<(String, String)>| {
        if let Some((name, lines)) = current {
            let body = lines.join("\n").trim().to_string();
            if !body.is_empty() && !sections.iter().any(|(existing, _)| *existing == name) {
                sections.push((name, body));
            }
        }
    };
    for line in text.lines() {
        match marker_name(line) {
            Some(name) => {
                finish(current.take(), &mut sections);
                current = Some((name, Vec::new()));
            }
            None => {
                if let Some((_, lines)) = current.as_mut() {
                    lines.push(line);
                }
            }
        }
    }
    finish(current.take(), &mut sections);
    ParsedReport { sections }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(name: &str, instruction: &str) -> SectionSpec {
        SectionSpec {
            name: name.to_string(),
            label: name.to_string(),
            instruction: instruction.to_string(),
        }
    }

    #[test]
    fn the_prompt_lists_every_section_and_keeps_only_the_four_placeholders() {
        let prompt = compose_prompt(&[
            spec("key-points", "List the key points."),
            spec("decisions", "List {the} decisions."),
        ]);

        assert!(prompt.contains("Section `key-points`:\nList the key points."));
        assert!(prompt.contains("Section `decisions`:\nList the decisions."));
        assert!(prompt.contains("### SECTION: key-points"));
        let mut tokens: Vec<&str> = prompt
            .match_indices('{')
            .map(|(start, _)| &prompt[start..start + prompt[start..].find('}').unwrap() + 1])
            .collect();
        tokens.sort_unstable();
        tokens.dedup();
        assert_eq!(
            tokens,
            vec!["{duration}", "{language}", "{title}", "{transcript}"]
        );
    }

    #[test]
    fn a_skill_instruction_is_its_prompt_up_to_the_transcript() {
        let prompt = "Extract the key points of \"{title}\" ({duration}).\n\nTranscript:\n{transcript}\n\nWrite in {language}.\n\nKey Points:";

        assert_eq!(
            skill_instruction(prompt),
            "Extract the key points of \"{title}\" ({duration})."
        );
    }

    #[test]
    fn a_skill_instruction_drops_tokens_the_engine_would_reject() {
        assert_eq!(
            skill_instruction("Use {style} and {title}.\n{transcript}"),
            "Use style and {title}."
        );
        assert_eq!(
            skill_instruction("no transcript here {oops"),
            "no transcript here oops"
        );
    }

    #[test]
    fn the_external_request_keeps_the_prompt_whole() {
        let wrapped = external_request("PROMPT BODY");

        assert!(wrapped.contains("PROMPT BODY"));
        assert!(wrapped.contains("Reply with the report only"));
    }

    #[test]
    fn a_report_is_split_at_its_markers() {
        let text = "### SECTION: key-points\n- a\n- b\n\n### SECTION: decisions\n- d\n";

        let parsed = parse_sections(text);

        assert_eq!(
            parsed.sections,
            vec![
                ("key-points".to_string(), "- a\n- b".to_string()),
                ("decisions".to_string(), "- d".to_string()),
            ]
        );
    }

    #[test]
    fn what_comes_before_the_first_marker_is_dropped() {
        let parsed = parse_sections("Here is your report:\n\n### SECTION: decisions\n- d");

        assert_eq!(parsed.sections.len(), 1);
        assert_eq!(parsed.sections[0].0, "decisions");
    }

    #[test]
    fn markers_survive_the_changes_models_make() {
        for marker in [
            "## SECTION: decisions",
            "**SECTION: decisions**",
            "### Section - decisions",
            "SECTION: `decisions`",
            "#### section: Decisions",
        ] {
            let parsed = parse_sections(&format!("{marker}\n- d"));
            assert_eq!(
                parsed.sections,
                vec![("decisions".to_string(), "- d".to_string())],
                "{marker}"
            );
        }
    }

    #[test]
    fn a_heading_that_merely_mentions_a_section_is_content() {
        let text = "### SECTION: key-points\n## Section of the roadmap\n- a";

        let parsed = parse_sections(text);

        assert_eq!(parsed.sections.len(), 1);
        assert!(parsed.sections[0].1.contains("Section of the roadmap"));
    }

    #[test]
    fn empty_and_repeated_sections_are_kept_out() {
        let text = "### SECTION: a\n\n### SECTION: b\nfirst\n### SECTION: b\nsecond\n";

        let parsed = parse_sections(text);

        assert_eq!(
            parsed.sections,
            vec![("b".to_string(), "first".to_string())]
        );
    }

    #[test]
    fn text_without_markers_gives_no_section() {
        assert!(parse_sections("just a paragraph").sections.is_empty());
        assert!(parse_sections("").sections.is_empty());
    }
}
