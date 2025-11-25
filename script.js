// script.js
let participantId = '';
let currentExperiment = {}; 
let allExperimentResults = []; // すべてのブロック（en/jp）の結果を保持

let currentPassphraseObject = null; 
let startTime = 0; 
let recallStartTime = 0; 
let currentErrors = 0;
const MAX_ERRORS = 5;

// !!! 【重要】BASE_API_URLをあなたのPythonAnywhereのURLに置き換える !!!
// -----------------------------------------------------------------
const BASE_API_URL = 'https://[あなたのユーザー名].pythonanywhere.com'; 
// -----------------------------------------------------------------


// --- UI制御関数 ---

/** 特定のステップIDを表示し、他を非表示にする */
function showStep(id) {
    document.querySelectorAll('.step').forEach(step => {
        step.style.display = 'none';
    });
    document.getElementById(id).style.display = 'flex'; // CSSでflexを使用
}

// --- 実験制御関数 ---

function startExperiment() {
    participantId = document.getElementById('participant-id').value.trim();
    if (!participantId || participantId.length < 3) {
        alert("参加者IDを正しく入力してください。");
        return;
    }
    
    // カウンターバランスはシンプルに、常に英語から開始
    startMemorizeStep('en'); 
}

/** 記憶ステップの開始（パスフレーズ取得と計測開始） */
async function startMemorizeStep(language) {
    showStep('memorize-step');
    document.getElementById('current-language').textContent = (language === 'en' ? '英語' : '日本語');
    document.getElementById('passphrase-display').textContent = 'パスフレーズを読み込み中...';
    document.getElementById('end-mem-btn').disabled = true;

    currentErrors = 0;
    currentExperiment = { language: language, participant_id: participantId, passphrase_id: 'N/A' }; // 初期化

    // サーバーから新しいパスフレーズを取得
    try {
        const response = await fetch(`${BASE_API_URL}/api/generate-passphrase/${language}`);
        const data = await response.json();

        if (response.ok) {
            currentPassphraseObject = { 
                passphrase: data.passphrase,
                language: data.language
                // idはサーバー側でランダム生成のためここでは取得しない
            };
            document.getElementById('passphrase-display').textContent = currentPassphraseObject.passphrase;
            document.getElementById('end-mem-btn').disabled = false;
            
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
    
    // 再生時間計測開始
    recallStartTime = Date.now(); 
    console.log(`[${language}] 再生計測開始`);
}

/** 確認ボタンが押された時の処理 (再生テスト) */
function checkPassphrase() {
    const userInput = document.getElementById('recall-input').value.trim();
    // スペースの有無も判定に含めるため trim() のみ使用
    const isCorrect = (userInput === currentPassphraseObject.passphrase);
    const language = currentPassphraseObject.language;

    if (isCorrect || currentErrors >= MAX_ERRORS - 1) { // 最後の試行または正解
        
        if (!isCorrect && currentErrors >= MAX_ERRORS - 1) {
            // 最後の試行も失敗
            currentErrors++; 
        }

        // 結果を確定
        const recallTime = Date.now() - recallStartTime;
        currentExperiment.recall_time_ms = recallTime;
        currentExperiment.error_count = currentErrors;
        currentExperiment.is_success = isCorrect;
        currentExperiment.passphrase = currentPassphraseObject.passphrase;
        
        allExperimentResults.push(currentExperiment); // 結果をリストに追加
        
        const nextLanguage = (language === 'en') ? 'jp' : 'en';

        // 次のブロックへ移行、または終了
        if (nextLanguage === 'jp') {
             startMemorizeStep('jp');
        } else {
             showStep('finish-step');
             handleFinalDataSubmit(); // 全ブロック完了後、データ送信
        }
        
    } else {
        // 間違い
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