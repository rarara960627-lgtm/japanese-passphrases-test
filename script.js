// script.js
let participantId = '';
let currentExperiment = {}; 
let allExperimentResults = []; // すべてのブロック（en/jp/pokemon）の結果を保持

let currentPassphraseObject = null; 
let startTime = 0; 
let recallStartTime = 0; 
let currentErrors = 0;
const MAX_ERRORS = 5;

// 🚨 修正点 1: 入力ミス記録用の配列を追加 🚨
let errorLog = []; 
let currentInputIndex = 0; // 現在入力しているパスフレーズの文字インデックス
let recallInputTimer = null; // 入力開始からのタイマーID

// !!! 【重要】BASE_API_URLをあなたのPythonAnywhereのURLに置き換える !!!
// -----------------------------------------------------------------
const BASE_API_URL = 'https://raimu7260.pythonanywhere.com';
// -----------------------------------------------------------------


// --- UI制御関数 ---

/** 特定のステップIDを表示し、他を非表示にする */
function showStep(id) {
    document.querySelectorAll('.step').forEach(step => {
        step.style.display = 'none';
    });
    document.getElementById(id).style.display = 'flex'; // CSSでflexを使用
}

// 🚨 追加: コピペ防止関数 (index.htmlの<script>タグに追加された前提) 🚨
function disableCopyPaste(elementId) {
    const displayElement = document.getElementById(elementId);
    if (!displayElement) return;

    // 右クリックメニュー (コンテキストメニュー) の禁止
    displayElement.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // Ctrl+C / Cmd+C (コピー) の禁止
    // body全体に適用
    document.addEventListener('keydown', function(e) {
        if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
        }
    });
    
    // テキストが選択されたときのコピー処理の禁止
    document.addEventListener('copy', function(e) {
         e.preventDefault();
    });
}


// --- 実験制御関数 ---

function startExperiment() {
    participantId = document.getElementById('participant-id').value.trim();
    if (!participantId || participantId.length < 3) {
        alert("参加者IDを正しく入力してください。");
        return;
    }
    
    // 🚨 修正点 2: 実験は英語から開始 🚨
    startMemorizeStep('en'); 
}

/** 言語コードに応じて表示名を返すヘルパー関数 */
function getLanguageDisplayName(languageCode) {
    switch (languageCode) {
        case 'en':
            return '英語（Diceware）';
        case 'jp':
            return '日本語（Diceware）';
        case 'pokemon':
            // 🚨 新規追加: ポケモンブロックの表示名 🚨
            return '日本語（ポケモン）';
        default:
            return '不明';
    }
}

/** 記憶ステップの開始（パスフレーズ取得と計測開始） */
async function startMemorizeStep(language) {
    showStep('memorize-step');
    // 🚨 修正点 3: getLanguageDisplayNameを使用 🚨
    document.getElementById('current-language').textContent = getLanguageDisplayName(language);
    document.getElementById('passphrase-display').textContent = 'パスフレーズを読み込み中...';
    document.getElementById('end-mem-btn').disabled = true;

    // 記憶ステップ開始時に errorLog をリセット
    currentErrors = 0;
    errorLog = [];
    currentInputIndex = 0;

    currentExperiment = { 
        language: language, 
        participant_id: participantId, 
        passphrase_id: 'N/A' 
    }; // 初期化

    // サーバーから新しいパスフレーズを取得
    try {
        const response = await fetch(`${BASE_API_URL}/api/generate-passphrase/${language}`);
        const data = await response.json();

        if (response.ok) {
            currentPassphraseObject = { 
                passphrase: data.passphrase,
                language: data.language
            };
            document.getElementById('passphrase-display').textContent = currentPassphraseObject.passphrase;
            document.getElementById('end-mem-btn').disabled = false;
            
            // パスフレーズ表示時にコピペを禁止する
            disableCopyPaste('passphrase-display');

            // 時間計測開始
            startTime = Date.now();
            console.log(`[${language}] 記憶計測開始`);

        } else {
            document.getElementById('passphrase-display').textContent = `エラー: ${data.error}`;
            alert(`パスフレーズの取得に失敗しました: ${data.error}`);
        }
    } catch (error) {
        alert("サーバーとの通信に失敗しました。URLと接続を確認してください。");
        showStep('intro-step'); // エラー時は導入に戻す
    }
}

/** 記憶完了ボタンが押された時の処理 */
function endMemorize() {
    const language = currentPassphraseObject.language;
    const memorizeTime = Date.now() - startTime;
    currentExperiment.memorize_time_ms = memorizeTime;

    showStep('distractor-step');
    startDistractorStep(language);
}

// --- 妨害タスク関連 ---

let distractorTimerId;

/** 妨害タスクの開始 (30秒タイマー) */
function startDistractorStep(language) {
    let timeLeft = 30;
    document.getElementById('distractor-timer').textContent = timeLeft;

    distractorTimerId = setInterval(() => {
        timeLeft--;
        document.getElementById('distractor-timer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(distractorTimerId);
            startRecallStep(language); // 再生ステップへ移行
        }
    }, 1000); // 1秒ごとに更新
}

// --- 再生タスク関連 ---

/** 再生ステップの開始 */
function startRecallStep(language) {
    showStep('recall-step');
    document.getElementById('error-count-display').textContent = MAX_ERRORS;
    document.getElementById('recall-input').value = ''; 
    document.getElementById('error-message').textContent = '';
    
    // 入力欄にイベントリスナーを追加
    const recallInput = document.getElementById('recall-input');
    recallInput.removeEventListener('input', handleRecallInput); // 重複防止
    recallInput.addEventListener('input', handleRecallInput);
    
    currentInputIndex = 0; // 入力インデックスをリセット
    recallInput.focus(); // 入力欄にフォーカス
    
    // 再生時間計測開始
    recallStartTime = Date.now(); 
    console.log(`[${language}] 再生計測開始`);
}

/** 入力イベントを捕捉し、ミスをリアルタイムで記録する関数 */
function handleRecallInput(e) {
    const userInput = e.target.value;
    const expectedPassphrase = currentPassphraseObject.passphrase;
    
    // 現在の入力文字数
    const inputLength = userInput.length;
    
    // 現在の入力インデックス
    const currentIndex = inputLength - 1;
    
    if (currentIndex >= 0) {
        const inputChar = userInput[currentIndex];
        const expectedChar = expectedPassphrase[currentIndex];

        // 期待される文字長を超えていないか、かつ文字が一致しないかを確認
        if (currentIndex < expectedPassphrase.length && inputChar !== expectedChar) {
            // ミスが発生した場合
            const errorTime = Date.now() - recallStartTime;
            
            // エラーログに記録
            errorLog.push({
                time_ms: errorTime,
                input_char: inputChar,
                expected_char: expectedChar || 'EOS', // 期待される文字がなければ 'EOS' (End of String)
                current_input_index: currentIndex,
                current_value: userInput // ミス時点の入力を記録
            });
            
            // 視覚的なエラーフィードバック
            document.getElementById('error-message').textContent = "❌ 文字が異なります！";
            document.getElementById('error-message').style.color = 'red';
            
            console.log(`[ERROR] Char: ${inputChar}, Expected: ${expectedChar}, Time: ${errorTime}ms`);

        } else if (inputChar === expectedChar) {
            // 正しい入力の場合、エラーメッセージをクリア
            document.getElementById('error-message').textContent = "";
        }
        // 長すぎる入力は checkPassphrase で処理されるため、ここでは無視
    }
}


/** 確認ボタンが押された時の処理 (再生テスト) */
function checkPassphrase() {
    const userInput = document.getElementById('recall-input').value.trim();
    // スペースの有無も判定に含めるため trim() のみ使用
    const expectedPassphrase = currentPassphraseObject.passphrase;
    const isCorrect = (userInput === expectedPassphrase);
    const language = currentPassphraseObject.language;

    // 現在のエラーカウントはerrorLogのサイズでなく、試行回数ベースで管理
    
    if (isCorrect || currentErrors >= MAX_ERRORS - 1) { // 最後の試行または正解
        
        if (!isCorrect && currentErrors >= MAX_ERRORS - 1) {
            // 最後の試行も失敗
            currentErrors++; 
        }

        // 結果を確定
        const recallTime = Date.now() - recallStartTime;
        currentExperiment.recall_time_ms = recallTime;
        currentExperiment.error_count = errorLog.length; // エラーカウントは errorLog のサイズを使用 
        currentExperiment.is_success = isCorrect;
        currentExperiment.passphrase = currentPassphraseObject.passphrase;
        
        // error_details として errorLog を追加
        currentExperiment.error_details = errorLog;
        
        allExperimentResults.push(currentExperiment); // 結果をリストに追加
        
        let nextLanguage;
        // 🚨 修正点 4: 実験フローの変更（en -> jp -> pokemon -> finish） 🚨
        if (language === 'en') {
            nextLanguage = 'jp';
        } else if (language === 'jp') {
            nextLanguage = 'pokemon';
        } else {
            nextLanguage = 'finish'; // 'pokemon' の次は終了
        }

        // 次のブロックへ移行、または終了
        if (nextLanguage !== 'finish') {
             startMemorizeStep(nextLanguage);
        } else {
             showStep('finish-step');
             handleFinalDataSubmit(); // 全ブロック完了後、データ送信
        }
        
    } else {
        // 間違い (試行回数を増やす)
        currentErrors++;
        document.getElementById('error-count-display').textContent = MAX_ERRORS - currentErrors;
        document.getElementById('recall-input').value = ''; // 入力欄をクリア
        document.getElementById('error-message').textContent = "❌ 間違いです。再入力してください。";
    }
}

// --- データ送信 ---

/** 最終データをサーバーに送信する処理 */
async function handleFinalDataSubmit() {
    const API_URL = `${BASE_API_URL}/api/save-result`; 
    const messageDisplay = document.getElementById('finish-message');
    
    messageDisplay.innerHTML = '<p>データ送信中です。しばらくお待ちください...</p>';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(allExperimentResults) 
        });

        if (response.ok) {
            console.log('データの自動保存に成功しました！');
            messageDisplay.innerHTML = '<h2>✅ データ保存完了</h2><p>実験にご協力いただき、ありがとうございました。すべてのデータが研究者に送信されました。</p>';
        } else {
            const errorData = await response.json();
            console.error('保存失敗:', errorData.error);
            messageDisplay.innerHTML = `<h2>❌ データ保存失敗</h2><p>自動保存に失敗しました。研究者にこの画面とエラーコード: ${response.status} をご連絡ください。</p>`;
        }
    } catch (error) {
        console.error('ネットワークエラー:', error);
        messageDisplay.innerHTML = '<h2>❌ 通信エラー</h2><p>サーバーとの接続エラーが発生しました。インターネット接続を確認し、研究者に連絡してください。</p>';
    }

}
