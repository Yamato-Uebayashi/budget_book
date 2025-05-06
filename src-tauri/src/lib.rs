use base64::{engine::general_purpose::STANDARD, Engine}; // updated import
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;

const DATA_DIR: &str = "data";
const DATA_FILE: &str = "data/budget_book_data.bin";

#[derive(Serialize, Deserialize, Debug)]
struct BudgetBookEntry {
    date: String,
    #[serde(rename = "type")]
    entry_type: String,
    amount: f64,
}

#[derive(Serialize, Deserialize)]
struct ChartData {
    income: Vec<(String, f64)>,
    expense: Vec<(String, f64)>,
}

fn encrypt_data(plain: &str) -> String {
    let key = b"mysecretkey";
    let encrypted: Vec<u8> = plain
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    STANDARD.encode(encrypted)
}

fn decrypt_data(cipher: &str) -> Result<String, String> {
    let key = b"mysecretkey";
    let decoded = STANDARD.decode(cipher).map_err(|e| e.to_string())?;
    let decrypted: Vec<u8> = decoded
        .into_iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

fn initialize_storage() {
    if !fs::metadata(DATA_DIR).is_ok() {
        fs::create_dir(DATA_DIR).expect("フォルダの作成に失敗しました");
    }
    if !fs::metadata(DATA_FILE).is_ok() {
        let empty_json = encrypt_data("[]");
        let mut file = fs::File::create(DATA_FILE).expect("ファイルの作成に失敗しました");
        file.write_all(empty_json.as_bytes())
            .expect("ファイルへの書き込みに失敗しました");
    }
}

#[tauri::command]
fn save_data(data: Vec<BudgetBookEntry>) -> Result<String, String> {
    println!("受け取ったデータ: {:?}", data);
    let json_string =
        serde_json::to_string_pretty(&data).map_err(|e| format!("JSON変換失敗: {}", e))?;
    let encrypted = encrypt_data(&json_string);
    fs::write(DATA_FILE, encrypted.as_bytes()).map_err(|e| format!("書き込み失敗: {}", e))?;
    println!("データを {} に保存しました。", DATA_FILE);
    Ok(format!("{} 件のデータを保存しました。", data.len()))
}

#[tauri::command]
fn load_data() -> Result<Vec<BudgetBookEntry>, String> {
    let encrypted_content =
        fs::read_to_string(DATA_FILE).map_err(|e| format!("ファイル読み込み失敗: {}", e))?;
    let decrypted = decrypt_data(&encrypted_content)?;
    serde_json::from_str(&decrypted).map_err(|e| format!("パース失敗: {}", e))
}

#[tauri::command]
fn get_chart_data() -> Result<ChartData, String> {
    let entries = load_data()?;
    let mut income = Vec::new();
    let mut expense = Vec::new();
    for entry in entries {
        // assume "income" and "expense" as keys; adjust if needed
        if entry.entry_type.to_lowercase() == "income" {
            income.push((entry.date, entry.amount));
        } else {
            expense.push((entry.date, entry.amount));
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
            get_chart_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
