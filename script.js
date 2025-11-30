let participantId = '';
let currentExperiment = {}; 
let allExperimentResults = []; // すべてのブロック（en/jp/pokemon）の結果を保持

let currentPassphraseObject = null; 
let startTime = 0; 
let recallStartTime = 0; 
// 潜伏時間計測開始用の時刻
let recallLatencyStartTime = 0;
let currentErrors = 0;
const MAX_ERRORS = 5;

let errorLog = []; 

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
    // flexを使用して要素を中央に配置（デザインはindex.html依存）
    document.getElementById(id).style.display = 'flex'; 
}

/** コピー＆ペーストを禁止し、パスフレーズの不正取得を防ぐ */
function disableCopyPaste(elementId) {
    const displayElement = document.getElementById(elementId);
    if (!displayElement) return;

    displayElement.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    document.addEventListener('keydown', function(e) {
        // Ctrl+C / Cmd+C (コピー) を禁止
        if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
        }
    });
    
    document.addEventListener('copy', function(e) {
         e.preventDefault();
    });
}


// --- 実験制御関数 ---

function startExperiment() {
    participantId = document.getElementById('participant-id').value.trim();
    if (!participantId || participantId.length < 3) {
        // alert() の代わりにカスタムモーダルまたはメッセージボックスを使用することが推奨されます
        alert("参加者IDを正しく入力してください。"); 
        return;
    }
    
    // 実験は英語から開始
    startMemorizeStep('en'); 
}

/** 言語コードに応じて表示名を返すヘルパー関数 */
function getLanguageDisplayName(languageCode) {
    switch (languageCode) {
        case 'en':
            return '英語パスフレーズ'; // 修正後
        case 'jp':
            return '日本語パスフレーズ'; // 修正後
        case 'pokemon':
            return 'ポケモンパスフレーズ'; // 修正後
        default:
            return '不明';
    }
}

/** 記憶ステップの開始（パスフレーズ取得と計測開始） */
async function startMemorizeStep(language) {
    showStep('memorize-step');
    document.getElementById('current-language').textContent = getLanguageDisplayName(language);
    document.getElementById('passphrase-display').textContent = 'パスフレーズを読み込み中...';
    document.getElementById('end-mem-btn').disabled = true;

    // 記憶ステップ開始時に errorLog と試行回数をリセット
    currentErrors = 0;
    errorLog = [];

    currentExperiment = { 
        language: language, 
        participant_id: participantId, 
        passphrase_id: 'N/A',
        recall_latency_s: null // 潜伏時間用のデータ項目を初期化
    }; 

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
            
            // パスフレーズ表示時にコピペを禁止
            disableCopyPaste('passphrase-display');

            // 記憶時間計測開始
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
    // 記憶時間を秒に変換 (Date.now() - startTime) の結果はミリ秒なので、1000で割って秒に変換
    const memorizeTime = (Date.now() - startTime) / 1000;
    // 単位は「ms」だが、中身は「秒」
    currentExperiment.memorize_time_ms = memorizeTime; 

    showStep('distractor-step');
    startDistractorStep(currentPassphraseObject.language);
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

/** 潜伏時間を計測し、イベントリスナーを削除するハンドラ (最初のキー入力時のみ実行) */
const handleFirstKey = (event) => {
    // 潜伏時間（秒）を計算: (現在の時刻 - 計測開始時刻) / 1000
    const latency = (Date.now() - recallLatencyStartTime) / 1000;
    currentExperiment.recall_latency_s = latency;
    console.log(`[${currentPassphraseObject.language}] 潜伏時間: ${latency.toFixed(3)}s`);

    // 潜伏時間の計測は1回きりなので、イベントリスナーを削除
    document.getElementById('recall-input').removeEventListener('keydown', handleFirstKey);
};

/** 再生ステップの開始 */
function startRecallStep(language) {
    showStep('recall-step');
    document.getElementById('error-count-display').textContent = MAX_ERRORS;
    document.getElementById('recall-input').value = ''; 
    document.getElementById('error-message').textContent = '';
    
    // 以前の潜伏時間計測用のリスナーが残っている可能性があるので削除
    document.getElementById('recall-input').removeEventListener('keydown', handleFirstKey);
    
    document.getElementById('recall-input').focus(); // 入力欄にフォーカス
    
    // 再生時間計測開始
    recallStartTime = Date.now(); 
    console.log(`[${language}] 再生計測開始`);

    // 潜伏時間計測の開始
    recallLatencyStartTime = Date.now();
    // 最初のキー入力で潜伏時間を記録するためのイベントリスナーを追加
    document.getElementById('recall-input').addEventListener('keydown', handleFirstKey, { once: true });
}


// --- ヘルパー関数: スペースを正規化して比較 ---
function normalizePassphrase(passphrase) {
    // 1. 全角スペースを半角に置換
    // 2. すべてのスペースを削除（単語の並び順のみをチェック）
    // 目的: 半角・全角スペースを許容し、単語の順序のみをチェックする
    return passphrase
        .replace(/　/g, ' ') // 全角スペースを半角スペースに変換
        .replace(/\s+/g, '') // 連続するスペース、または残ったスペースをすべて削除 
        .trim();
}


/** 確認ボタンが押された時の処理 (再生テスト) */
function checkPassphrase() {
    const userInput = document.getElementById('recall-input').value.trim();
    const expectedPassphrase = currentPassphraseObject.passphrase;
    const language = currentPassphraseObject.language;

    // 正誤判定は、スペースを無視した文字列で比較
    const normalizedUserInput = normalizePassphrase(userInput);
    const normalizedExpected = normalizePassphrase(expectedPassphrase);

    // 正しい入力か、または規定の試行回数に達したかをチェック
    const isCorrect = (normalizedUserInput === normalizedExpected);
    
    // 成功または最終試行（失敗）時の処理
    if (isCorrect || currentErrors >= MAX_ERRORS - 1) { 
        
        if (!isCorrect && currentErrors >= MAX_ERRORS - 1) {
            // 最後の試行も失敗した場合、試行回数をインクリメント
            currentErrors++; 
        }

        // 💡 再生時間は、正解が確認された時点、または最終試行が終わった時点で記録
        const recallTime = (Date.now() - recallStartTime) / 1000;
        currentExperiment.recall_time_ms = recallTime;
        
        // 潜伏時間計測用のリスナーを削除（保険）
        document.getElementById('recall-input').removeEventListener('keydown', handleFirstKey);

        // 失敗した場合、最後の試行をログに記録
        if (!isCorrect) {
             errorLog.push({
                 // 記録するのは、想起開始からの経過秒数
                 time_s: recallTime, 
                 input_value: userInput, // ユーザーの生入力
                 attempt: currentErrors // 試行回数
             });
        }
        
        // 潜伏時間が記録されていない場合（キーを押さずに確認ボタンを押した場合など）は 0 を記録
        if (currentExperiment.recall_latency_s === null) {
            currentExperiment.recall_latency_s = 0;
        }

        // error_count は、失敗して記録されたログの数
        currentExperiment.error_count = errorLog.length;
        currentExperiment.is_success = isCorrect;
        currentExperiment.passphrase = currentPassphraseObject.passphrase;
        currentExperiment.error_details = errorLog;
        
        allExperimentResults.push(currentExperiment); // 結果をリストに追加
        
        let nextLanguage;
        // 実験フローの定義（en -> jp -> pokemon -> finish）
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
        
        // 記録するのは、想起開始からの経過秒数
        const errorTime = (Date.now() - recallStartTime) / 1000;
        errorLog.push({
            time_s: errorTime, // 確認ボタンを押した時点の経過秒数
            input_value: userInput, // ユーザーの生入力
            attempt: currentErrors // 試行回数
        });
        
        document.getElementById('error-count-display').textContent = MAX_ERRORS - currentErrors;
        document.getElementById('recall-input').value = ''; // 入力欄をクリア
        
        // エラーメッセージ
        document.getElementById('error-message').textContent = `❌ 間違いです。再入力してください。残り試行回数: ${MAX_ERRORS - currentErrors}`;
        document.getElementById('error-message').style.color = 'red';
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
