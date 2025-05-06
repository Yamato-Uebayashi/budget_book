document.addEventListener("DOMContentLoaded", async () => {
  const addButton = document.getElementById("add-button");
  const inputForm = document.getElementById("input-form");
  const BudgetBookForm = document.getElementById("budget-book-form");
  const cancelButton = document.getElementById("cancel-button");
  const tableBody = document.querySelector("#budget-book-table tbody"); // テーブルのtbody要素を取得
  const saveButton = document.getElementById("save-button");

  // グローバルなエントリ配列を用意
  let BudgetBookEntries = [];

  // 自動で過去のデータを読み込む処理を追加
  const { invoke } = window.__TAURI__.core;
  let userPassword = "";

  try {
    const isSet = await invoke("is_password_set");
    if (!isSet) {
      userPassword = prompt(
        "パスワードが設定されていません。新しいパスワードを設定してください:"
      );
      if (userPassword) {
        const res = await invoke("set_password", { password: userPassword });
        alert(res);
      } else {
        alert("パスワードが必要です。");
        return;
      }
    } else {
      let valid = false;
      while (!valid) {
        userPassword = prompt("パスワードを入力してください:");
        valid = await invoke("verify_password", { password: userPassword });
        if (!valid) {
          alert("パスワードが正しくありません。再度入力してください。");
        }
      }
    }
  } catch (error) {
    console.error("パスワード処理エラー:", error);
    return;
  }

  // Store password globally for use when saving data
  window.userPassword = userPassword;

  // Load and restore data using the valid password
  try {
    const entries = await invoke("load_data", {
      password: window.userPassword,
    });
    entries.forEach((entry) => {
      const newRow = tableBody.insertRow(); // 新しい行を追加
      const cell1 = newRow.insertCell(); // 日付セル
      const cell2 = newRow.insertCell(); // 収支セル
      const cell3 = newRow.insertCell(); // 金額セル
      cell1.textContent = entry.date;
      cell2.textContent = entry.type;
      cell3.textContent = entry.amount;
      cell3.style.textAlign = "right"; // 金額は右寄せ

      // グローバル配列にも追加
      BudgetBookEntries.push({
        date: entry.date,
        type: entry.type,
        amount: parseInt(entry.amount, 10), // changed from parseFloat
      });
    });
  } catch (error) {
    console.error("データ復元失敗:", error);
  }

  // 保存ボタンのリスナー
  saveButton.addEventListener("click", async () => {
    const rows = tableBody.querySelectorAll("tr");
    const entries = [];
    rows.forEach((row) => {
      const cells = row.getElementsByTagName("td");
      if (cells.length >= 3) {
        const entry = {
          date: cells[0].textContent,
          type: cells[1].textContent,
          amount: parseFloat(cells[2].textContent),
        };
        entries.push(entry);
      }
    });

    try {
      // Rust側の save_data 関数を呼び出す
      const result = await invoke("save_data", {
        data: entries,
        password: window.userPassword,
      });
      alert(result); // 保存完了メッセージを表示
    } catch (error) {
      alert("保存に失敗しました: " + error);
    }
  });

  // 「追加」ボタンをクリックしたらフォームを表示
  addButton.addEventListener("click", () => {
    inputForm.classList.remove("hidden"); // hiddenクラスを削除して表示
    // フォーム内の日付を今日の日付に設定（任意）
    document.getElementById("date").valueAsDate = new Date();
  });

  // 「キャンセル」ボタンをクリックしたらフォームを非表示
  cancelButton.addEventListener("click", () => {
    inputForm.classList.add("hidden"); // hiddenクラスを追加して非表示
    BudgetBookForm.reset(); // フォームの内容をリセット
  });

  // フォームが送信（登録ボタンクリック）されたらデータを処理
  BudgetBookForm.addEventListener("submit", (event) => {
    event.preventDefault(); // デフォルトのフォーム送信動作をキャンセル

    // 入力された値を取得
    const date = document.getElementById("date").value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;

    // 簡単なバリデーション（空でないか）
    if (!date || !type || !amount) {
      alert("すべての項目を入力してください。");
      return;
    }

    console.log("入力データ:", { date, type, amount }); // コンソールに入力内容を表示（デバッグ用）

    // --- ここから下は、実際にはデータをテーブルに追加する処理 ---
    // （今回はコンソール表示とフォーム非表示のみ）
    // 例：テーブルに行を追加する場合
    const newRow = tableBody.insertRow(); // 新しい行を追加
    const cell1 = newRow.insertCell(); // 日付セル
    const cell2 = newRow.insertCell(); // 収支セル
    const cell3 = newRow.insertCell(); // 金額セル

    cell1.textContent = date;
    cell2.textContent = type;
    cell3.textContent = amount;
    cell3.style.textAlign = "right"; // 金額は右寄せにすることが多い

    // 入力されたエントリをグローバル配列に追加
    BudgetBookEntries.push({
      date: date,
      type: type,
      amount: parseInt(amount, 10), // changed from parseFloat
    });

    // -----------------------------------------------------------

    // フォームを非表示にし、内容をリセット
    inputForm.classList.add("hidden");
    BudgetBookForm.reset();
  });
});
