document.addEventListener("DOMContentLoaded", async () => {
  // This script manages the budget book application's UI and data interactions.
  // It handles adding, editing, deleting, and displaying budget entries,
  // as well as managing user authentication and data persistence.
  // このスクリプトは家計簿アプリケーションのUIとデータ操作を管理します。
  // 予算エントリの追加、編集、削除、表示、
  // およびユーザー認証とデータ永続化を処理します。

  // --- DOM Elements ---
  const addButton = document.getElementById("add-button");
  const saveButton = document.getElementById("save-button");
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const inputForm = document.getElementById("input-form");
  const budgetBookForm = document.getElementById("budget-book-form");
  const cancelButton = document.getElementById("cancel-button");
  const tableBody = document.querySelector("#budget-book-table tbody");
  const dailyTrendCanvas = document.getElementById("daily-trend-chart");
  const prevYearButton = document.getElementById("prev-year-button");
  const nextYearButton = document.getElementById("next-year-button");
  const currentYearDisplay = document.getElementById("current-year-display");
  const editButton = document.getElementById("edit-button");
  const deleteButton = document.getElementById("delete-button");
  const dateInput = document.getElementById("date");

  // --- State ---
  let budgetBookEntries = [];
  let dailyTrendChart = null;
  let currentYear = new Date().getFullYear();
  let editingEntryId = null;
  let selectedRowIndex = -1;

  const { invoke } = window.__TAURI__.core;
  let userPassword = "";

  // --- Initialization ---
  async function initialize() {
    await setupPassword();
    await loadData();
    setupEventListeners();
    // Initialize Flatpickr for the date input.
    // 日付入力にFlatpickrを初期化します。
    flatpickr(dateInput, {
        dateFormat: "Y-m-d",
        locale: "ja", // 日本語ローカライズ
        // ダークモード対応
        onOpen: function(selectedDates, dateStr, instance) {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                instance.calendarContainer.classList.add('flatpickr-dark');
            } else {
                instance.calendarContainer.classList.remove('flatpickr-dark');
            }
        }
    });
    setupDarkMode();
    updateUI();
  }

  // --- Setup Functions ---
  // Handles user password setup and verification.
  // ユーザーパスワードの設定と検証を処理します。
  async function setupPassword() {
    try {
      const isSet = await invoke("is_password_set");
      if (!isSet) {
        userPassword = prompt("新しいパスワードを設定してください:");
        if (userPassword) await invoke("set_password", { password: userPassword });
        else { alert("パスワードが必要です。"); return; }
      } else {
        let valid = false;
        while (!valid) {
          userPassword = prompt("パスワードを入力してください:");
          valid = await invoke("verify_password", { password: userPassword });
          if (!valid) alert("パスワードが正しくありません。");
        }
      }
      window.userPassword = userPassword;
    } catch (error) { console.error("パスワード処理エラー:", error); }
  }

  // Loads budget data from the backend.
  // バックエンドから家計簿データをロードします。
  async function loadData() {
    try {
      const entries = await invoke("load_data", { password: window.userPassword });
      budgetBookEntries = entries.map((e, index) => ({ ...e, id: `entry-${Date.now()}-${index}`, amount: parseInt(e.amount, 10), date: new Date(e.date) }));
    } catch (error) { console.error("データ復元失敗:", error); }
  }

  // Sets up all event listeners for UI interactions.
  // UI操作のためのすべてのイベントリスナーを設定します。
  function setupEventListeners() {
    addButton.addEventListener("click", () => showInputForm());
    saveButton.addEventListener("click", saveData);
    cancelButton.addEventListener("click", () => hideInputForm());
    darkModeToggle.addEventListener("click", toggleDarkMode);
    prevYearButton.addEventListener("click", () => { currentYear--; updateUI(); });
    nextYearButton.addEventListener("click", () => { currentYear++; updateUI(); });
    editButton.addEventListener("click", editSelectedRow);
    deleteButton.addEventListener("click", deleteSelectedRow);
    budgetBookForm.addEventListener("submit", handleFormSubmit);

    // --- Date Picker Fix ---
    

    // --- Keyboard Shortcuts ---
    document.addEventListener("keydown", (e) => {
      if (inputForm.classList.contains('hidden')) {
        // Global shortcuts when form is hidden
        switch (e.key.toLowerCase()) {
          case 'a': e.preventDefault(); showInputForm(); break;
          case 's': e.preventDefault(); saveData(); break;
          case 'j': e.preventDefault(); moveSelection(1); break;
          case 'k': e.preventDefault(); moveSelection(-1); break;
          case 'e': e.preventDefault(); editSelectedRow(); break;
          case 'd': e.preventDefault(); deleteSelectedRow(); break;
        }
      } else {
        // Shortcuts when form is visible
        if (e.key === 'Escape') {
            e.preventDefault();
            hideInputForm();
        }
      }
    });
  }

  // Initializes dark mode based on user preference or system settings.
  // ユーザー設定またはシステム設定に基づいてダークモードを初期化します。
  function setupDarkMode() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  // --- Core Functions ---
  // Updates the entire UI, including table and charts.
  // テーブルとチャートを含むUI全体を更新します。
  function updateUI() {
    currentYearDisplay.textContent = currentYear;
    renderTable();
    renderCharts();
  }

  // Saves the current budget data to the backend.
  // 現在の家計簿データをバックエンドに保存します。
  async function saveData() {
    try {
      const dataToSave = budgetBookEntries.map(e => ({ date: e.date.toISOString().split('T')[0], type: e.type, amount: e.amount }));
      const res = await invoke("save_data", { data: dataToSave, password: window.userPassword });
      alert(res);
    } catch (error) { alert("保存に失敗しました: " + error); }
  }

  // Handles the submission of the budget entry form.
  // 家計簿入力フォームの送信を処理します。
  function handleFormSubmit(event) {
    event.preventDefault();
    const date = document.getElementById("date").value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = document.getElementById("amount").value;
    if (!date || !type || !amount) { alert("すべての項目を入力してください。"); return; }

    if (editingEntryId) {
      const index = budgetBookEntries.findIndex(e => e.id === editingEntryId);
      if (index > -1) {
        budgetBookEntries[index] = { ...budgetBookEntries[index], date: new Date(date), type, amount: parseInt(amount, 10) };
      }
    } else {
      const newId = `entry-${Date.now()}`;
      budgetBookEntries.push({ id: newId, date: new Date(date), type, amount: parseInt(amount, 10) });
    }
    
    budgetBookEntries.sort((a, b) => a.date - b.date);
    updateUI();
    hideInputForm();
  }

  // Displays the input form, optionally pre-filling with entry data for editing.
  // 入力フォームを表示し、必要に応じて編集用のエントリデータで事前入力します。
  function showInputForm(entry = null) {
    editingEntryId = null;
    if (entry) {
        editingEntryId = entry.id;
        dateInput.value = entry.date.toISOString().split('T')[0];
        document.querySelector(`input[name="type"][value="${entry.type}"]`).checked = true;
        document.getElementById("amount").value = entry.amount;
    }
    inputForm.classList.remove("hidden");
    dateInput.focus();
  }

  // Hides the input form and resets it.
  // 入力フォームを非表示にし、リセットします。
  function hideInputForm() {
    inputForm.classList.add("hidden");
    budgetBookForm.reset();
    editingEntryId = null;
  }

  // Toggles between dark and light mode.
  // ダークモードとライトモードを切り替えます。
  function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateUI();
  }

  // --- Keyboard Navigation & Actions ---
  // Moves the selection up or down in the table.
  // テーブルの選択を上下に移動します。
  function moveSelection(direction) {
      const rows = tableBody.querySelectorAll("tr");
      if (rows.length === 0) return;

      selectedRowIndex += direction;

      if (selectedRowIndex < 0) selectedRowIndex = 0;
      if (selectedRowIndex >= rows.length) selectedRowIndex = rows.length - 1;

      updateRowSelection();
  }

  // Updates the visual selection of rows and shows/hides edit/delete buttons.
  // 行の視覚的な選択を更新し、編集/削除ボタンの表示/非表示を切り替えます。
  function updateRowSelection() {
      const rows = tableBody.querySelectorAll("tr");
      let rowIsSelected = false;
      rows.forEach((row, index) => {
          const isSelected = index === selectedRowIndex;
          row.classList.toggle('selected-row', isSelected);
          if (isSelected) rowIsSelected = true;
      });

      // 選択されている行があれば編集・削除ボタンを表示
      if (rowIsSelected) {
          editButton.classList.remove('hidden');
          deleteButton.classList.remove('hidden');
      } else {
          editButton.classList.add('hidden');
          deleteButton.classList.add('hidden');
      }
  }

  // Initiates editing for the currently selected row.
  // 現在選択されている行の編集を開始します。
  function editSelectedRow() {
      if (selectedRowIndex === -1) return;
      const entryId = budgetBookEntries.filter(e => e.date.getFullYear() === currentYear)[selectedRowIndex]?.id;
      if (entryId) {
          const entry = budgetBookEntries.find(e => e.id === entryId);
          if (entry) showInputForm(entry);
      }
  }

  // Deletes the currently selected row.
  // 現在選択されている行を削除します。
  function deleteSelectedRow() {
      if (selectedRowIndex === -1) return;
      const entryId = budgetBookEntries.filter(e => e.date.getFullYear() === currentYear)[selectedRowIndex]?.id;
      if (entryId) {
          budgetBookEntries = budgetBookEntries.filter(e => e.id !== entryId);
          // 選択インデックスを調整
          if (selectedRowIndex >= tableBody.querySelectorAll("tr").length -1) {
              selectedRowIndex--;
          }
          updateUI();
      }
  }

  // --- Rendering ---
  // Renders the budget entries table.
  // 家計簿エントリのテーブルをレンダリングします。
  function renderTable() {
    tableBody.innerHTML = "";
    const yearEntries = budgetBookEntries.filter(e => e.date.getFullYear() === currentYear);

    yearEntries.forEach(entry => {
      const newRow = tableBody.insertRow();
      newRow.innerHTML = `
        <td>${entry.date.toISOString().split('T')[0]}</td>
        <td>${entry.type}</td>
        <td style="text-align: right;">${entry.amount.toLocaleString()}</td>
      `;
    });

    
    updateRowSelection();
  }

  // Renders the daily trend and balance charts.
  // 日次トレンドと残高のチャートをレンダリングします。
  function renderCharts() {
    const yearEntries = budgetBookEntries.filter(e => e.date.getFullYear() === currentYear);
    const dailyAggregates = yearEntries.reduce((acc, entry) => {
        const day = entry.date.toISOString().split('T')[0];
        if (!acc[day]) acc[day] = { income: 0, expense: 0 };
        if (entry.type === '収入') acc[day].income += entry.amount;
        else acc[day].expense += entry.amount;
        return acc;
    }, {});

    const sortedDays = Object.keys(dailyAggregates).sort();
    const incomeDataset = sortedDays.map(day => ({ x: day, y: dailyAggregates[day].income }));
    const expenseDataset = sortedDays.map(day => ({ x: day, y: dailyAggregates[day].expense }));

    // Calculate the balance from previous years
    // 前年までの残高を計算
    let balance = 0;
    const allEntriesSorted = [...budgetBookEntries].sort((a, b) => a.date - b.date);
    for (const entry of allEntriesSorted) {
        if (entry.date.getFullYear() < currentYear) {
            if (entry.type === '収入') {
                balance += entry.amount;
            } else {
                balance -= entry.amount;
            }
        } else {
            break; // Stop when entries for the current year or later are encountered
        }
    }
    const balanceData = sortedDays.map(day => {
        balance += dailyAggregates[day].income - dailyAggregates[day].expense;
        return { x: day, y: balance };
    });

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
    const chartOptions = {
        scales: {
            x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'yyyy/MM' } }, ticks: { color: textColor }, grid: { color: textColor + '40' } },
            y: { ticks: { color: textColor, callback: value => Number.isInteger(value) ? value.toLocaleString() : null }, grid: { color: textColor + '40' } }
        },
        plugins: { legend: { labels: { color: textColor } } }
    };

    if (dailyTrendChart) dailyTrendChart.destroy();
    dailyTrendChart = new Chart(dailyTrendCanvas, {
      type: 'line',
      data: { datasets: [
          { label: '収入', data: incomeDataset, borderColor: 'rgba(75, 192, 192, 1)', tension: 0.1 },
          { label: '支出', data: expenseDataset, borderColor: 'rgba(255, 99, 132, 1)', tension: 0.1 },
          { label: '残高', data: balanceData, borderColor: 'rgba(54, 162, 235, 1)', tension: 0.1 }
      ]},
      options: chartOptions
    });
  }

  initialize();
});