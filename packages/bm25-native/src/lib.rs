use std::collections::HashMap;

use napi_derive::napi;

/// Tokenize the same way the TS implementation does:
/// - English words: consecutive `[a-z]+` runs (after lowercasing)
/// - Chinese chars: every single `[\u4e00-\u9fa5]` char
/// Both token types are pushed into the same Vec in encounter order.
fn tokenize(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let bytes = lower.as_bytes();
    let mut tokens: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_alphabetic() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            tokens.push(lower[start..i].to_string());
        } else if c >= 0xE4 && c <= 0xE9 {
            // 0xE4..0xE9 covers U+4E00..U+9FFF (CJK Unified Ideographs)
            if i + 3 <= bytes.len() {
                tokens.push(lower[i..i + 3].to_string());
                i += 3;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    tokens
}

#[napi(object)]
pub struct BM25Result {
    pub id: String,
    pub score: f64,
}

#[napi]
pub struct BM25Index {
    k1: f64,
    b: f64,
    docs: HashMap<String, Vec<String>>,
    /// document frequency: how many docs contain the token
    df: HashMap<String, u32>,
    doc_len: HashMap<String, usize>,
    /// running total of doc lengths; avg = total / docs.len()
    total_len: u64,
}

#[napi]
impl BM25Index {
    #[napi(constructor)]
    pub fn new(k1: Option<f64>, b: Option<f64>) -> Self {
        BM25Index {
            k1: k1.unwrap_or(1.5),
            b: b.unwrap_or(0.75),
            docs: HashMap::new(),
            df: HashMap::new(),
            doc_len: HashMap::new(),
            total_len: 0,
        }
    }

    #[napi]
    pub fn add(&mut self, id: String, text: String) {
        let tokens = tokenize(&text);
        let len = tokens.len() as u64;
        self.total_len += len;
        self.doc_len.insert(id.clone(), tokens.len());
        self.docs.insert(id, tokens.clone());
        let mut seen: std::collections::HashSet<&String> = std::collections::HashSet::new();
        for t in &tokens {
            if seen.insert(t) {
                *self.df.entry(t.clone()).or_insert(0) += 1;
            }
        }
    }

    #[napi]
    pub fn remove(&mut self, id: String) -> bool {
        let Some(tokens) = self.docs.get(&id) else {
            return false;
        };
        let len = tokens.len() as u64;
        self.total_len = self.total_len.saturating_sub(len);
        self.doc_len.remove(&id);
        let mut seen: std::collections::HashSet<&String> = std::collections::HashSet::new();
        for t in tokens {
            if seen.insert(t) {
                if let Some(count) = self.df.get_mut(t) {
                    if *count <= 1 {
                        self.df.remove(t);
                    } else {
                        *count -= 1;
                    }
                }
            }
        }
        self.docs.remove(&id);
        true
    }

    #[napi]
    pub fn search(&self, query: String, top_k: Option<i64>) -> Vec<BM25Result> {
        let top_k = top_k.unwrap_or(10).max(0) as usize;
        let query_tokens = tokenize(&query);
        let n = self.docs.len() as f64;
        if n == 0.0 || query_tokens.is_empty() {
            return Vec::new();
        }
        let avg = (self.total_len as f64) / n;

        let mut results: Vec<(&String, f64)> = Vec::new();
        for (id, doc_tokens) in &self.docs {
            let doc_len = self.doc_len.get(id).copied().unwrap_or(0) as f64;
            let mut score = 0.0f64;
            for qt in &query_tokens {
                let tf = doc_tokens.iter().filter(|t| *t == qt).count() as f64;
                if tf == 0.0 {
                    continue;
                }
                let df_val = self.df.get(qt).copied().unwrap_or(0) as f64;
                let idf = (1.0 + (n - df_val + 0.5) / (df_val + 0.5)).ln();
                let tf_norm =
                    (tf * (self.k1 + 1.0)) / (tf + self.k1 * (1.0 - self.b + self.b * (doc_len / avg.max(1.0))));
                score += idf * tf_norm;
            }
            if score > 0.0 {
                results.push((id, score));
            }
        }

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results
            .into_iter()
            .take(top_k)
            .map(|(id, score)| BM25Result { id: id.clone(), score })
            .collect()
    }

    #[napi]
    pub fn size(&self) -> i64 {
        self.docs.len() as i64
    }
}
