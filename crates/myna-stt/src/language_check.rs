//! Wrong-language check for decoded segments: tells whether a segment reads
//! as French when the meeting is English, or the other way round.
//!
//! Parakeet-TDT v3 has no language pin (see [`crate::suspect`]), so a French
//! meeting still gets the odd English line, typically a short or noisy
//! segment the decoder pulls towards its English prior. This module cannot
//! fix that; it finds those segments so they can be marked for review. It
//! counts function words that belong to one language only. A segment is
//! flagged when most of its words are such words of the *other* language and
//! none belongs to the expected one. Words shared by both languages ("a",
//! "on", "pour" is French only, "a" is both) are left out, so loanwords and
//! the odd English term inside a French sentence never trip it.
//!
//! Only French and English have word lists; any other expected language is
//! never flagged.

/// Words that only French uses (or that French uses far more).
const FRENCH_WORDS: &[&str] = &[
    "le", "la", "les", "un", "une", "des", "du", "de", "et", "est", "sont", "je", "tu", "il",
    "elle", "nous", "vous", "ils", "elles", "ce", "cette", "ces", "que", "qui", "quoi", "dans",
    "pour", "avec", "sur", "pas", "ne", "mais", "ou", "où", "donc", "alors", "oui", "non", "très",
    "aussi", "comme", "ça", "c'est", "j'ai", "qu'il", "n'est", "voilà", "bon", "bien", "merci",
    "d'accord", "on", "se", "sa", "son", "ses", "mon", "ma", "mes", "au", "aux", "par", "plus",
    "ai", "as", "avons", "avez", "ont", "suis", "êtes", "fait", "faire", "peut", "faut", "y", "en",
];

/// Words that only English uses (or that English uses far more).
const ENGLISH_WORDS: &[&str] = &[
    "the", "and", "you", "your", "it's", "it", "is", "are", "was", "were", "to", "of", "that",
    "this", "these", "those", "so", "did", "do", "does", "or", "what", "let's", "see", "wait",
    "yeah", "yes", "no", "not", "we", "they", "he", "she", "i", "i'm", "i've", "don't", "can",
    "will", "would", "with", "for", "have", "has", "had", "be", "been", "but", "if", "when",
    "there", "here", "just", "good", "luck", "pick", "one", "two", "three", "four", "five", "six",
    "seven", "zero", "eight", "nine", "ten", "thank", "thanks", "please", "right", "well",
];

/// Words in both lists above are ambiguous and ignored when counting.
fn is_shared(word: &str) -> bool {
    FRENCH_WORDS.contains(&word) && ENGLISH_WORDS.contains(&word)
}

/// Lowercased words of `text` with edge punctuation stripped; apostrophes
/// (straight or curly) and inner hyphens stay inside a word.
fn words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|raw| {
            raw.trim_matches(|c: char| !c.is_alphanumeric())
                .replace('\u{2019}', "'")
                .to_lowercase()
        })
        .filter(|word| !word.is_empty())
        .collect()
}

fn count_in(list: &[&str], words: &[String]) -> usize {
    words
        .iter()
        .filter(|word| list.contains(&word.as_str()) && !is_shared(word))
        .count()
}

/// Whether `text` reads as the other of French and English than `expected`
/// (an ISO 639-1 code). `false` for any `expected` other than `fr` or `en`,
/// and for text with no words.
pub fn is_wrong_language(text: &str, expected: &str) -> bool {
    let (own, other) = match expected {
        "fr" => (FRENCH_WORDS, ENGLISH_WORDS),
        "en" => (ENGLISH_WORDS, FRENCH_WORDS),
        _ => return false,
    };
    let words = words(text);
    if words.is_empty() {
        return false;
    }
    let foreign = count_in(other, &words);
    let native = count_in(own, &words);
    native == 0 && foreign > 0 && foreign * 2 >= words.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_lines_in_a_french_meeting_are_flagged() {
        for text in [
            "Let's see.",
            "It's so did uh.",
            "Or do you pick it?",
            "Wait.",
            "Yeah, Papi one seven zero two.",
        ] {
            assert!(is_wrong_language(text, "fr"), "{text}");
        }
    }

    #[test]
    fn french_lines_in_a_french_meeting_are_not_flagged() {
        for text in [
            "Je sais comment les configurer, en fait, maintenant.",
            "Donc celui-là on pourrait...",
            "Ok, d'autres choses ?",
            "Voilà.",
            "Mm.",
        ] {
            assert!(!is_wrong_language(text, "fr"), "{text}");
        }
    }

    #[test]
    fn an_english_term_inside_a_french_sentence_is_not_flagged() {
        assert!(!is_wrong_language(
            "On fait le sprint review demain, okay ?",
            "fr"
        ));
        assert!(!is_wrong_language("C'est le même ticket, yeah.", "fr"));
    }

    #[test]
    fn acknowledgements_that_french_speakers_say_in_english_are_not_flagged() {
        for text in ["Okay.", "D'accord, okay.", "Mm-hmm.", "OK, parfait."] {
            assert!(!is_wrong_language(text, "fr"), "{text}");
        }
    }

    #[test]
    fn french_lines_in_an_english_meeting_are_flagged() {
        assert!(is_wrong_language("Oui, c'est bon, merci.", "en"));
        assert!(!is_wrong_language("Yes, that is fine, thank you.", "en"));
    }

    #[test]
    fn curly_apostrophes_and_punctuation_do_not_hide_words() {
        assert!(is_wrong_language("Let\u{2019}s see!", "fr"));
        assert!(is_wrong_language("\u{201c}Wait\u{201d}…", "fr"));
    }

    #[test]
    fn languages_without_a_word_list_are_never_flagged() {
        assert!(!is_wrong_language("Let's see.", "de"));
        assert!(!is_wrong_language("Let's see.", "auto"));
    }

    #[test]
    fn empty_or_punctuation_only_text_is_not_flagged() {
        assert!(!is_wrong_language("", "fr"));
        assert!(!is_wrong_language("...", "fr"));
    }

    #[test]
    fn no_word_sits_in_both_lists_by_accident() {
        // Shared words are tolerated but should stay rare: they are ignored
        // when counting, so each one weakens the check.
        let shared: Vec<&&str> = FRENCH_WORDS
            .iter()
            .filter(|word| ENGLISH_WORDS.contains(word))
            .collect();
        assert!(shared.len() <= 3, "{shared:?}");
    }
}
