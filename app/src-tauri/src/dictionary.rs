//! The user's own vocabulary: a few lines that fix what the speech model
//! keeps getting wrong (a trade term, an abbreviation, a colleague's name).
//!
//! One line per entry:
//!
//! ```text
//! la F = l'AF        # heard text = wanted text
//! fumur = fumure
//! Dyhia              # a term with no rule: only kept for the summaries
//! ```
//!
//! Pure text logic with no dependency on the rest of the app, so it can be
//! tested alone. Matching ignores case, needs whole words, tries the longest
//! phrase first, and never rewrites its own output.

/// Parsed vocabulary.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Dictionary {
    /// `(heard, wanted)`, longest `heard` first.
    rules: Vec<(Vec<char>, String)>,
    /// Every wanted spelling and every bare term, without duplicates.
    terms: Vec<String>,
}

/// Longest entry kept, in characters; a stray paste is not a vocabulary.
const MAX_ENTRY_CHARS: usize = 80;

/// Most entries kept.
const MAX_ENTRIES: usize = 500;

impl Dictionary {
    /// Reads the text typed in Settings. Blank lines and `#` comments are
    /// skipped, and so are rules with an empty side: a rule never deletes a
    /// word by accident.
    pub fn parse(text: &str) -> Self {
        let mut rules = Vec::new();
        let mut terms: Vec<String> = Vec::new();
        for raw in text.lines().take(MAX_ENTRIES) {
            let line = raw.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let (heard, wanted) = match line.split_once('=') {
                Some((heard, wanted)) => (Some(heard.trim()), wanted.trim()),
                None => (None, line),
            };
            if wanted.is_empty() || wanted.chars().count() > MAX_ENTRY_CHARS {
                continue;
            }
            if let Some(heard) = heard {
                let heard: Vec<char> = heard
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .collect();
                if heard.is_empty() || heard.len() > MAX_ENTRY_CHARS {
                    continue;
                }
                rules.push((heard, wanted.to_string()));
            }
            if !terms.iter().any(|t| t == wanted) {
                terms.push(wanted.to_string());
            }
        }
        rules.sort_by_key(|(heard, _)| std::cmp::Reverse(heard.len()));
        Self { rules, terms }
    }

    /// Whether there is nothing to apply and nothing to tell the summaries.
    pub fn is_empty(&self) -> bool {
        self.rules.is_empty() && self.terms.is_empty()
    }

    /// The spellings to respect, for the summary prompt.
    pub fn terms(&self) -> &[String] {
        &self.terms
    }

    /// `text` with every rule applied.
    pub fn apply(&self, text: &str) -> String {
        if self.rules.is_empty() {
            return text.to_string();
        }
        let chars: Vec<char> = text.chars().collect();
        let mut out = String::with_capacity(text.len());
        let mut i = 0;
        while i < chars.len() {
            let at_boundary = i == 0 || !chars[i - 1].is_alphanumeric();
            if at_boundary {
                if let Some((used, wanted)) = self.match_at(&chars, i) {
                    out.push_str(wanted);
                    i += used;
                    continue;
                }
            }
            out.push(chars[i]);
            i += 1;
        }
        out
    }

    /// The first rule matching at `start`: `(characters used, replacement)`.
    fn match_at(&self, chars: &[char], start: usize) -> Option<(usize, &str)> {
        'rules: for (heard, wanted) in &self.rules {
            let mut at = start;
            for &h in heard {
                if h == ' ' {
                    if at >= chars.len() || !chars[at].is_whitespace() {
                        continue 'rules;
                    }
                    while at < chars.len() && chars[at].is_whitespace() {
                        at += 1;
                    }
                } else {
                    if at >= chars.len() || !same_char(chars[at], h) {
                        continue 'rules;
                    }
                    at += 1;
                }
            }
            if at < chars.len() && chars[at].is_alphanumeric() {
                continue;
            }
            return Some((at - start, wanted));
        }
        None
    }
}

fn same_char(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_examples_of_the_doc_work() {
        let d = Dictionary::parse("la F = l'AF\nfumur = fumure\nDyhia\n");

        assert_eq!(
            d.apply("ouais, mais là la F elle est légère"),
            "ouais, mais là l'AF elle est légère"
        );
        assert_eq!(
            d.apply("la liste pour référencier le fumur."),
            "la liste pour référencier le fumure."
        );
        assert_eq!(d.terms(), ["l'AF", "fumure", "Dyhia"]);
    }

    #[test]
    fn matching_ignores_case_and_needs_whole_words() {
        let d = Dictionary::parse("dia = Dyhia");

        assert_eq!(d.apply("T'inquiète pas, Dia."), "T'inquiète pas, Dyhia.");
        assert_eq!(d.apply("dia, DIA"), "Dyhia, Dyhia");
        assert_eq!(d.apply("diagnostic et radia"), "diagnostic et radia");
    }

    #[test]
    fn the_longest_phrase_wins_and_output_is_not_rewritten() {
        let d = Dictionary::parse("la F = l'AF\nla = le\nF = effe");

        assert_eq!(d.apply("la F"), "l'AF");
        let loop_free = Dictionary::parse("a = b\nb = a");
        assert_eq!(loop_free.apply("a b"), "b a");
    }

    #[test]
    fn blank_lines_comments_and_empty_sides_are_ignored() {
        let d = Dictionary::parse("\n# note\n= nothing\nword =\n  x  =  y  # trailing\n");

        assert_eq!(d.apply("x word"), "y word");
        assert_eq!(d.terms(), ["y"]);
    }

    #[test]
    fn accents_and_runs_of_spaces_in_the_text_are_handled() {
        let d = Dictionary::parse("pret a = prêt à");

        assert_eq!(d.apply("c'est Pret   A partir"), "c'est prêt à partir");
        assert_eq!(
            Dictionary::parse("élan = Élan").apply("un élan fort"),
            "un Élan fort"
        );
    }

    #[test]
    fn an_empty_dictionary_changes_nothing() {
        let d = Dictionary::parse("");
        assert!(d.is_empty());
        assert_eq!(d.apply("rien à faire"), "rien à faire");
    }
}
