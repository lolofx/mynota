//! The link between a meeting and its exported Markdown file (ADR 0022).
//!
//! Pure file logic with no dependency on the rest of the app, so it can be
//! tested alone. A meeting remembers the path of its file *relative to the
//! export folder*; the file carries the meeting id (`mynota_id`) in its front
//! matter, so a file moved inside the vault can be found again.
//!
//! The generated parts of the file sit between HTML comment markers
//! (`<!-- mynota:begin transcript -->` ... `<!-- mynota:end transcript -->`).
//! A re-export rewrites only those blocks and the front matter keys it owns;
//! whatever the user typed outside them is kept.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

/// Blocks every exported file carries, in order.
pub const BLOCKS: [&str; 2] = ["transcript", "summary"];

/// Front matter key holding the meeting id.
pub const ID_KEY: &str = "mynota_id";

/// Deepest sub-folder level the scan looks into.
const MAX_SCAN_DEPTH: usize = 8;

/// Most Markdown files the scan opens, so a huge vault cannot stall start-up.
const MAX_SCAN_FILES: usize = 20_000;

/// How much of a file the scan reads: the front matter is at the top.
const HEAD_BYTES: u64 = 8 * 1024;

/// Why a linked export could not be written or adopted.
#[derive(Debug)]
pub enum LinkError {
    /// The file has no front matter or lacks a marker pair; overwriting it
    /// could destroy text the app did not write.
    MarkersMissing,
    /// The file belongs to another meeting.
    OtherMeeting,
    /// The path is not a Markdown file inside the export folder.
    BadPath(String),
    Io(io::Error),
}

impl std::fmt::Display for LinkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MarkersMissing => write!(
                f,
                "the exported file has no Mynota markers: relink it to another file or recreate the export"
            ),
            Self::OtherMeeting => write!(f, "this file belongs to another meeting"),
            Self::BadPath(reason) => write!(f, "{reason}"),
            Self::Io(err) => write!(f, "{err}"),
        }
    }
}

impl From<io::Error> for LinkError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

/// Where a meeting's export stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkState {
    /// The linked file exists.
    Linked,
    /// A path is stored but the file is gone.
    Missing,
    /// Never exported.
    NotExported,
}

/// `<!-- mynota:begin name -->\nbody\n<!-- mynota:end name -->\n`.
pub fn block(name: &str, body: &str) -> String {
    let body = body.trim_end_matches('\n');
    if body.is_empty() {
        format!("{}\n{}\n", begin(name), end(name))
    } else {
        format!("{}\n{body}\n{}\n", begin(name), end(name))
    }
}

fn begin(name: &str) -> String {
    format!("<!-- mynota:begin {name} -->")
}

fn end(name: &str) -> String {
    format!("<!-- mynota:end {name} -->")
}

/// Byte range of the text between the markers of `name`, markers excluded.
fn block_range(doc: &str, name: &str) -> Option<(usize, usize)> {
    let open = begin(name);
    let close = end(name);
    let start = doc.find(&open)? + open.len();
    let stop = start + doc[start..].find(&close)?;
    Some((start, stop))
}

/// Splits a document into its front matter lines and the rest. `None` when
/// the document does not open with a closed `---` front matter.
fn split_front_matter(doc: &str) -> Option<(Vec<&str>, &str)> {
    let rest = doc.strip_prefix("---\n")?;
    let mut offset = 0;
    let mut lines = Vec::new();
    for line in rest.split_inclusive('\n') {
        offset += line.len();
        if line.trim_end() == "---" {
            return Some((lines, &rest[offset..]));
        }
        lines.push(line.trim_end_matches('\n'));
    }
    None
}

/// The value of `key` in the front matter, without surrounding quotes.
pub fn front_matter_value(doc: &str, key: &str) -> Option<String> {
    let doc = doc.replace("\r\n", "\n");
    let (lines, _) = split_front_matter(&doc)?;
    let prefix = format!("{key}:");
    lines.iter().find_map(|line| {
        let value = line.strip_prefix(&prefix)?.trim();
        Some(value.trim_matches(|c| c == '"' || c == '\'').to_string())
    })
}

/// Whether `doc` carries every marker pair a re-export needs.
pub fn has_markers(doc: &str) -> bool {
    let doc = doc.replace("\r\n", "\n");
    split_front_matter(&doc).is_some() && BLOCKS.iter().all(|b| block_range(&doc, b).is_some())
}

/// Writes `fresh` into `existing`: the front matter keys of `fresh` replace
/// or join those of `existing` (other keys stay), and each marked block is
/// replaced; everything else is kept as is.
pub fn merge(existing: &str, fresh: &str) -> Result<String, LinkError> {
    let crlf = existing.contains("\r\n");
    let old = existing.replace("\r\n", "\n");
    let new = fresh.replace("\r\n", "\n");

    let (old_front, old_body) = split_front_matter(&old).ok_or(LinkError::MarkersMissing)?;
    let (new_front, _) = split_front_matter(&new).ok_or(LinkError::MarkersMissing)?;

    let mut front: Vec<String> = old_front.iter().map(|l| (*l).to_string()).collect();
    for line in new_front {
        let key = line.split(':').next().unwrap_or("");
        let prefix = format!("{key}:");
        match front.iter().position(|l| l.starts_with(&prefix)) {
            Some(at) => front[at] = line.to_string(),
            None => front.push(line.to_string()),
        }
    }
    // A key that fresh leaves out (no speakers any more) must not linger.
    if !new_front_has(&new, "speakers") {
        front.retain(|l| !l.starts_with("speakers:"));
    }

    let mut body = old_body.to_string();
    for name in BLOCKS {
        let (new_start, new_stop) = block_range(&new, name).ok_or(LinkError::MarkersMissing)?;
        let (start, stop) = block_range(&body, name).ok_or(LinkError::MarkersMissing)?;
        body.replace_range(start..stop, &new[new_start..new_stop]);
    }

    let mut out = String::from("---\n");
    for line in &front {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str("---\n");
    out.push_str(&body);
    Ok(if crlf { out.replace('\n', "\r\n") } else { out })
}

fn new_front_has(doc: &str, key: &str) -> bool {
    split_front_matter(doc)
        .map(|(lines, _)| lines.iter().any(|l| l.starts_with(&format!("{key}:"))))
        .unwrap_or(false)
}

/// Resolves a stored relative path under `folder`, refusing anything that
/// could leave it.
pub fn resolve(folder: &Path, relative: &str) -> Result<PathBuf, LinkError> {
    let path = Path::new(relative);
    let clean =
        !relative.is_empty() && path.components().all(|c| matches!(c, Component::Normal(_)));
    if !clean {
        return Err(LinkError::BadPath(format!(
            "invalid export path: {relative}"
        )));
    }
    Ok(folder.join(path))
}

/// `file` as a `/`-separated path relative to `folder`. The file must exist
/// and live under the folder.
pub fn relative_to(folder: &Path, file: &Path) -> Result<String, LinkError> {
    let folder = folder.canonicalize()?;
    let file = file.canonicalize()?;
    let inside = file
        .strip_prefix(&folder)
        .map_err(|_| LinkError::BadPath("the file is outside the export folder".to_string()))?;
    let parts: Vec<String> = inside
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    Ok(parts.join("/"))
}

/// State of a stored link.
pub fn state(folder: &Path, relative: Option<&str>) -> LinkState {
    match relative {
        None => LinkState::NotExported,
        Some(rel) => match resolve(folder, rel) {
            Ok(path) if path.is_file() => LinkState::Linked,
            _ => LinkState::Missing,
        },
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
}

fn read_head(path: &Path) -> io::Result<String> {
    use io::Read;
    let mut buf = Vec::new();
    fs::File::open(path)?
        .take(HEAD_BYTES)
        .read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Every Markdown file under `folder` whose front matter has a `mynota_id`,
/// as `(id, relative path)`. Hidden entries are skipped; depth and file count
/// are capped.
pub fn scan(folder: &Path) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut opened = 0;
    scan_dir(folder, folder, 0, &mut opened, &mut found);
    found
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    depth: usize,
    opened: &mut usize,
    found: &mut Vec<(String, String)>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if *opened >= MAX_SCAN_FILES {
            return;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if depth < MAX_SCAN_DEPTH {
                scan_dir(root, &path, depth + 1, opened, found);
            }
        } else if kind.is_file() && is_markdown(&path) {
            *opened += 1;
            let Ok(head) = read_head(&path) else {
                continue;
            };
            let Some(id) = front_matter_value(&head, ID_KEY).filter(|v| !v.is_empty()) else {
                continue;
            };
            if let Ok(rel) = relative_to(root, &path) {
                found.push((id, rel));
            }
        }
    }
}

/// Atomic write: a hidden temporary file, then a rename, so a tool watching
/// the folder never reads half a file.
fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(dir)?;
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let temporary = dir.join(format!(".{name}.tmp"));
    fs::write(&temporary, contents)?;
    fs::rename(&temporary, path).inspect_err(|_| {
        let _ = fs::remove_file(&temporary);
    })
}

/// Writes the export of meeting `id` and returns its path relative to
/// `folder`.
///
/// - A linked file that exists is merged (text outside the markers kept);
///   without markers the write is refused.
/// - Otherwise the file is created at `default_name`. A file already there
///   is reused when it carries this meeting's id, or when it is a file this
///   app wrote before markers existed (front matter, no `mynota_id`, no
///   markers) and the meeting had no link yet. Any other file is left alone
///   and the export goes to a numbered name.
pub fn write_export(
    folder: &Path,
    linked: Option<&str>,
    id: &str,
    default_name: &str,
    fresh: &str,
) -> Result<String, LinkError> {
    fs::create_dir_all(folder)?;

    if let Some(rel) = linked {
        let path = resolve(folder, rel)?;
        if path.is_file() {
            let existing = fs::read_to_string(&path)?;
            let merged = merge(&existing, fresh)?;
            write_atomic(&path, &merged)?;
            return Ok(rel.to_string());
        }
    }

    let (stem, ext) = match default_name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (default_name.to_string(), String::new()),
    };
    for n in 1..1000 {
        let name = if n == 1 {
            default_name.to_string()
        } else {
            format!("{stem}-{n}{ext}")
        };
        let path = folder.join(&name);
        if !path.exists() {
            write_atomic(&path, fresh)?;
            return Ok(name);
        }
        let existing = fs::read_to_string(&path).unwrap_or_default();
        let owner = front_matter_value(&existing, ID_KEY);
        let ours = owner.as_deref() == Some(id);
        let legacy = linked.is_none()
            && owner.is_none()
            && front_matter_value(&existing, "title").is_some()
            && !has_markers(&existing);
        if ours && has_markers(&existing) {
            write_atomic(&path, &merge(&existing, fresh)?)?;
            return Ok(name);
        }
        if ours || legacy {
            write_atomic(&path, fresh)?;
            return Ok(name);
        }
    }
    Err(LinkError::BadPath(
        "no free file name in the export folder".to_string(),
    ))
}

/// Checks that `file` can be adopted by meeting `id` and returns its path
/// relative to `folder`: a Markdown file inside the folder, with the marker
/// pairs, not owned by another meeting.
pub fn adopt(folder: &Path, file: &Path, id: &str) -> Result<String, LinkError> {
    if !is_markdown(file) || !file.is_file() {
        return Err(LinkError::BadPath("choose a Markdown file".to_string()));
    }
    let rel = relative_to(folder, file)?;
    let text = fs::read_to_string(file)?;
    if let Some(owner) = front_matter_value(&text, ID_KEY) {
        if owner != id {
            return Err(LinkError::OtherMeeting);
        }
    }
    if !has_markers(&text) {
        return Err(LinkError::MarkersMissing);
    }
    Ok(rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(id: &str, title: &str, transcript: &str, summary: &str) -> String {
        format!(
            "---\ntitle: {title}\nstatus: to-summarize\n{ID_KEY}: {id}\n---\n\n{}\n{}",
            block("transcript", transcript),
            block("summary", summary)
        )
    }

    fn read(path: &Path) -> String {
        fs::read_to_string(path).expect("read")
    }

    #[test]
    fn block_wraps_the_body_and_an_empty_block_keeps_its_markers() {
        assert_eq!(
            block("summary", "x\n"),
            "<!-- mynota:begin summary -->\nx\n<!-- mynota:end summary -->\n"
        );
        assert_eq!(
            block("summary", ""),
            "<!-- mynota:begin summary -->\n<!-- mynota:end summary -->\n"
        );
    }

    #[test]
    fn front_matter_value_unquotes_and_ignores_the_body() {
        let text = "---\ntitle: \"A: b\"\nmynota_id: abc\n---\n\nmynota_id: other\n";
        assert_eq!(front_matter_value(text, "title").as_deref(), Some("A: b"));
        assert_eq!(front_matter_value(text, ID_KEY).as_deref(), Some("abc"));
        assert_eq!(front_matter_value("no front matter", ID_KEY), None);
    }

    #[test]
    fn merge_replaces_blocks_and_keeps_text_outside_them() {
        let old = format!(
            "{}\nMy remark before.\n",
            doc("1", "Old title", "[00:00:01] old", "")
        )
        .replace(
            "<!-- mynota:begin summary -->",
            "Between.\n\n<!-- mynota:begin summary -->",
        );
        let fresh = doc("1", "New title", "[00:00:01] new", "## Summary: x\n\nbody");

        let merged = merge(&old, &fresh).expect("merge");

        assert!(merged.contains("title: New title\n"), "{merged}");
        assert!(merged.contains("[00:00:01] new"), "{merged}");
        assert!(!merged.contains("[00:00:01] old"), "{merged}");
        assert!(merged.contains("## Summary: x"), "{merged}");
        assert!(merged.contains("Between.\n"), "{merged}");
        assert!(merged.ends_with("My remark before.\n"), "{merged}");
    }

    #[test]
    fn merge_keeps_front_matter_keys_it_does_not_own_and_drops_stale_speakers() {
        let old = "---\ntitle: T\nspeakers: [Me]\ntags: [work]\nmynota_id: 1\n---\n\n\
                   <!-- mynota:begin transcript -->\n<!-- mynota:end transcript -->\n\
                   <!-- mynota:begin summary -->\n<!-- mynota:end summary -->\n";
        let fresh = doc("1", "T", "", "");

        let merged = merge(old, &fresh).expect("merge");

        assert!(merged.contains("tags: [work]\n"), "{merged}");
        assert!(!merged.contains("speakers:"), "{merged}");
        assert!(merged.contains("status: to-summarize\n"), "{merged}");
    }

    #[test]
    fn merge_refuses_a_file_without_markers_or_front_matter() {
        let fresh = doc("1", "T", "a", "");
        assert!(matches!(
            merge("---\ntitle: T\n---\n\nhand written\n", &fresh),
            Err(LinkError::MarkersMissing)
        ));
        assert!(matches!(
            merge("just text", &fresh),
            Err(LinkError::MarkersMissing)
        ));
        let one_pair = "---\ntitle: T\n---\n\n<!-- mynota:begin transcript -->\n<!-- mynota:end transcript -->\n";
        assert!(matches!(
            merge(one_pair, &fresh),
            Err(LinkError::MarkersMissing)
        ));
    }

    #[test]
    fn merge_keeps_windows_line_endings() {
        let old = doc("1", "T", "old", "").replace('\n', "\r\n");
        let merged = merge(&old, &doc("1", "T", "new", "")).expect("merge");
        assert!(merged.contains("\r\n"));
        assert!(!merged.replace("\r\n", "").contains('\n'), "{merged:?}");
        assert!(merged.contains("new"));
    }

    #[test]
    fn resolve_refuses_paths_that_leave_the_folder() {
        let folder = Path::new("/vault");
        assert!(resolve(folder, "a/b.md").is_ok());
        assert!(resolve(folder, "../b.md").is_err());
        assert!(resolve(folder, "/etc/passwd").is_err());
        assert!(resolve(folder, "").is_err());
    }

    #[test]
    fn first_export_creates_the_default_file_and_a_renamed_title_keeps_one_file() {
        let dir = tempfile::tempdir().expect("tempdir");

        let first = write_export(dir.path(), None, "1", "d_old.md", &doc("1", "Old", "a", ""))
            .expect("first");
        // The title changed, so the default name changed; the link wins.
        let second = write_export(
            dir.path(),
            Some(&first),
            "1",
            "d_new.md",
            &doc("1", "New", "b", ""),
        )
        .expect("second");

        assert_eq!(first, "d_old.md");
        assert_eq!(second, first);
        let files: Vec<_> = fs::read_dir(dir.path()).expect("dir").collect();
        assert_eq!(files.len(), 1);
        assert!(read(&dir.path().join("d_old.md")).contains("title: New"));
    }

    #[test]
    fn a_missing_linked_file_is_recreated_at_the_default_name() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(
            state(dir.path(), Some("gone.md")),
            LinkState::Missing,
            "a stored path with no file"
        );

        let rel = write_export(
            dir.path(),
            Some("gone.md"),
            "1",
            "d.md",
            &doc("1", "T", "a", ""),
        )
        .expect("recreate");

        assert_eq!(rel, "d.md");
        assert_eq!(state(dir.path(), Some(&rel)), LinkState::Linked);
        assert_eq!(state(dir.path(), None), LinkState::NotExported);
    }

    #[test]
    fn a_moved_file_is_found_again_by_the_scan() {
        let dir = tempfile::tempdir().expect("tempdir");
        let rel =
            write_export(dir.path(), None, "42", "d.md", &doc("42", "T", "a", "")).expect("export");
        fs::create_dir_all(dir.path().join("Projects/2026")).expect("mkdir");
        fs::rename(
            dir.path().join(&rel),
            dir.path().join("Projects/2026/moved.md"),
        )
        .expect("move");
        fs::write(dir.path().join("plain.md"), "no front matter").expect("plain");
        fs::create_dir_all(dir.path().join(".obsidian")).expect("hidden");
        fs::write(dir.path().join(".obsidian/x.md"), doc("99", "T", "", "")).expect("hidden file");

        let found = scan(dir.path());

        assert_eq!(
            found,
            vec![("42".to_string(), "Projects/2026/moved.md".to_string())]
        );
        assert_eq!(
            state(dir.path(), Some("Projects/2026/moved.md")),
            LinkState::Linked
        );
    }

    #[test]
    fn text_added_outside_the_markers_survives_a_re_export() {
        let dir = tempfile::tempdir().expect("tempdir");
        let rel =
            write_export(dir.path(), None, "1", "d.md", &doc("1", "T", "a", "")).expect("export");
        let path = dir.path().join(&rel);
        let edited = format!("{}\nMy own paragraph.\n", read(&path));
        fs::write(&path, edited).expect("edit");

        write_export(dir.path(), Some(&rel), "1", "d.md", &doc("1", "T", "b", "")).expect("again");

        let text = read(&path);
        assert!(text.contains("My own paragraph."), "{text}");
        assert!(text.contains('b'), "{text}");
    }

    #[test]
    fn an_export_over_a_linked_file_without_markers_is_refused_and_untouched() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(
            dir.path().join("mine.md"),
            "---\ntitle: T\n---\n\nprecious\n",
        )
        .expect("seed");

        let result = write_export(
            dir.path(),
            Some("mine.md"),
            "1",
            "d.md",
            &doc("1", "T", "a", ""),
        );

        assert!(matches!(result, Err(LinkError::MarkersMissing)));
        assert_eq!(
            read(&dir.path().join("mine.md")),
            "---\ntitle: T\n---\n\nprecious\n"
        );
    }

    #[test]
    fn a_file_written_before_markers_is_upgraded_but_a_foreign_file_is_not_overwritten() {
        let dir = tempfile::tempdir().expect("tempdir");
        // What the beta exports looked like: front matter, no id, no markers.
        fs::write(
            dir.path().join("d.md"),
            "---\ntitle: T\nstatus: summarized\n---\n\n[00:00:01] old\n",
        )
        .expect("legacy");
        let rel =
            write_export(dir.path(), None, "1", "d.md", &doc("1", "T", "a", "")).expect("upgrade");
        assert_eq!(rel, "d.md");
        assert!(has_markers(&read(&dir.path().join("d.md"))));

        // Another meeting's file with the same name stays untouched.
        let other =
            write_export(dir.path(), None, "2", "d.md", &doc("2", "T", "z", "")).expect("other");
        assert_eq!(other, "d-2.md");
        assert!(read(&dir.path().join("d.md")).contains("mynota_id: 1"));
    }

    #[test]
    fn adopt_accepts_a_marked_file_and_refuses_the_others() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(dir.path().join("sub")).expect("mkdir");
        let mine = dir.path().join("sub/mine.md");
        fs::write(&mine, doc("1", "T", "a", "")).expect("mine");
        let foreign = dir.path().join("foreign.md");
        fs::write(&foreign, doc("2", "T", "a", "")).expect("foreign");
        let bare = dir.path().join("bare.md");
        fs::write(&bare, "---\ntitle: T\n---\n\ntext\n").expect("bare");
        let outside = tempfile::tempdir().expect("outside");
        let stranger = outside.path().join("s.md");
        fs::write(&stranger, doc("1", "T", "a", "")).expect("stranger");

        assert_eq!(adopt(dir.path(), &mine, "1").expect("adopt"), "sub/mine.md");
        assert!(matches!(
            adopt(dir.path(), &foreign, "1"),
            Err(LinkError::OtherMeeting)
        ));
        assert!(matches!(
            adopt(dir.path(), &bare, "1"),
            Err(LinkError::MarkersMissing)
        ));
        assert!(matches!(
            adopt(dir.path(), &stranger, "1"),
            Err(LinkError::BadPath(_))
        ));
        assert!(matches!(
            adopt(dir.path(), &dir.path().join("none.txt"), "1"),
            Err(LinkError::BadPath(_))
        ));
    }
}
