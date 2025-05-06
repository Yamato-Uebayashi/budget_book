use base64::{engine::general_purpose::STANDARD, Engine}; // updated import
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, create_dir_all};
use std::io::Write;
use std::path::{Path, PathBuf};

const DATA_DIR: &str = "data";
const DATA_FILE: &str = "budget_book_data.bin";

#[derive(Serialize, Deserialize, Debug)]
struct BudgetBookEntry {
    date: String,
    #[serde(rename = "type")]
    entry_type: String,
    amount: u64,
}

#[derive(Serialize, Deserialize)]
struct ChartData {
    income: Vec<(String, f64)>,
    expense: Vec<(String, f64)>,
}

// Add a helper to compute the absolute data file path
fn get_data_file_path() -> Result<PathBuf, String> {
    let data_dir = Path::new(DATA_DIR);
    if create_dir_all(&data_dir).is_err() {
        return Err("データディレクトリの作成に失敗しました".to_string());
    }

    Ok(data_dir.join(DATA_FILE))
}

// Helper: derive file path for stored password hash
fn get_password_file_path() -> Result<PathBuf, String> {
    let mut path = get_data_file_path()?;
    path.set_file_name("password.hash");
    Ok(path)
}

// Helper: Vernam cipher (repeating-key XOR)
fn vernam_cipher(input: &[u8], key: &[u8]) -> Vec<u8> {
    input
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ key[i % key.len()])
        .collect()
}

fn initialize_storage() {
    let file_path = get_data_file_path().expect("データファイルのパス取得に失敗しました");
    if !file_path.exists() {
        let empty_json = "[]";
        let mut file = fs::File::create(&file_path).expect("ファイル作成に失敗しました");
        file.write_all(empty_json.as_bytes())
            .expect("書き込みに失敗しました");
    }
}

#[tauri::command]
fn is_password_set() -> Result<bool, String> {
    let path = get_password_file_path()?;
    Ok(path.exists())
}

#[tauri::command]
fn set_password(password: String) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = hasher.finalize();
    let path = get_password_file_path()?;
    fs::write(&path, &hash).map_err(|e| format!("パスワード保存失敗: {}", e))?;
    Ok("パスワードが設定されました。".into())
}

#[tauri::command]
fn verify_password(password: String) -> Result<bool, String> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let input_hash = hasher.finalize();
    let path = get_password_file_path()?;
    let stored_hash = fs::read(&path).map_err(|e| format!("パスワード読み込み失敗: {}", e))?;
    Ok(input_hash.as_slice() == stored_hash.as_slice())
}

#[tauri::command]
fn save_data(data: Vec<BudgetBookEntry>, password: String) -> Result<String, String> {
    println!("受け取ったデータ: {:?}", data);
    let json_string =
        serde_json::to_string_pretty(&data).map_err(|e| format!("JSON変換失敗: {}", e))?;

    // Derive encryption key from password hash
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let key = hasher.finalize();
    let encrypted_bytes = vernam_cipher(json_string.as_bytes(), &key);

    let file_path = get_data_file_path()?;
    fs::write(&file_path, &encrypted_bytes).map_err(|e| format!("書き込み失敗: {}", e))?;
    println!("データを {:?} に保存しました。", file_path);
    Ok(format!("{} 件のデータを保存しました。", data.len()))
}

#[tauri::command]
fn load_data(password: String) -> Result<Vec<BudgetBookEntry>, String> {
    let file_path = get_data_file_path()?;
    let encrypted_bytes =
        fs::read(&file_path).map_err(|e| format!("ファイル読み込み失敗: {}", e))?;
    if encrypted_bytes.is_empty() {
        return Ok(vec![]);
    }
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let key = hasher.finalize();
    let decrypted_bytes = vernam_cipher(&encrypted_bytes, &key);
    let decrypted_str =
        String::from_utf8(decrypted_bytes).map_err(|e| format!("データ復元失敗: {}", e))?;
    serde_json::from_str(&decrypted_str).map_err(|e| format!("パース失敗: {}", e))
}

#[tauri::command]
fn get_chart_data(password: String) -> Result<ChartData, String> {
    let entries = load_data(password)?;
    let mut income = Vec::new();
    let mut expense = Vec::new();
    for entry in entries {
        // assume "income" and "expense" as keys; adjust if needed
        if entry.entry_type.to_lowercase() == "income" {
            income.push((entry.date, entry.amount as f64));
        } else {
            expense.push((entry.date, entry.amount as f64));
        }
    }
    Ok(ChartData { income, expense })
}

pub fn run() {
    // Initialize storage: create folder and empty file if missing
    initialize_storage();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_data,
            load_data,
            get_chart_data,
            is_password_set,
            set_password,
            verify_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
