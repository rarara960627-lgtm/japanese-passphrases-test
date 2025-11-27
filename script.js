// script.js
let participantId = '';
let currentExperiment = {}; 
let allExperimentResults = []; // すべてのブロック（en/jp/pokemon）の結果を保持

let currentPassphraseObject = null; 
let startTime = 0; 
let recallStartTime = 0; 
let currentErrors = 0;
const MAX_ERRORS = 5;

// 🚨 変更: 入力ミス記録用の配列は維持しますが、記録ロジックを変更します 🚨
let errorLog = []; 
// 🚨 変更: 不要になった変数は削除します (currentInputIndex, recallInputTimer) 🚨

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
        // alert() の代わりにカスタムモーダルまたはメッセージボックスを使用することが推奨されます
        // ただし、今回は既存のコードを踏襲し、alert() のままにします。
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
            // alert() の代わりにカスタムモーダルまたはメッセージボックスを使用することが推奨されます
            alert(`パスフレーズの取得に失敗しました: ${data.error}`);
        }
    } catch (error) {
        // alert() の代わりにカスタムモーダルまたはメッセージボックスを使用することが推奨されます
        alert("サーバーとの通信に失敗しました。URLと接続を確認してください。");
        showStep('intro-step'); // エラー時は導入に戻す
    }
}

/** 記憶完了ボタンが押された時の処理 */
function endMemorize() {
    const language = currentPassphraseObject.language;
    
    // 🚨 変更 1: 記憶時間を秒に変換 🚨 (Date.now() - startTime) の結果はミリ秒なので、1000で割って秒に変換しています
    const memorizeTime = (Date.now() - startTime) / 1000;
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
    
    // 🚨 変更 2: 一文字ごとの判定を削除したため、inputイベントリスナーは不要 🚨
    const recallInput = document.getElementById('recall-input');
    recallInput.removeEventListener('input', handleRecallInput);
    
    recallInput.focus(); // 入力欄にフォーカス
    
    // 再生時間計測開始
    recallStartTime = Date.now(); 
    console.log(`[${language}] 再生計測開始`);
}


// --- ヘルパー関数: スペースを正規化して比較 ---
function normalizePassphrase(passphrase) {
    // 1. 全角スペースを半角に置換
    // 2. すべてのスペースを削除（単語の並び順のみをチェック）
    // 🚨 目的: 半角・全角スペースを許容し、単語の順序のみをチェックする 🚨
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

    // 🚨 変更 4: 正誤判定は、スペースを無視した文字列で比較 🚨
    const normalizedUserInput = normalizePassphrase(userInput);
    const normalizedExpected = normalizePassphrase(expectedPassphrase);

    const isCorrect = (normalizedUserInput === normalizedExpected);
    
    if (isCorrect || currentErrors >= MAX_ERRORS - 1) { // 最後の試行または正解
        
        if (!isCorrect && currentErrors >= MAX_ERRORS - 1) {
            // 最後の試行も失敗
            currentErrors++; 
        }

        // 🚨 変更 5: 計測時間を秒に変換 🚨 (Date.now() - recallStartTime) の結果はミリ秒なので、1000で割って秒に変換しています
        const recallTime = (Date.now() - recallStartTime) / 1000;
        currentExperiment.recall_time_ms = recallTime;
        
        // 🚨 変更 6: 入力ミス記録を最終試行時に集計 🚨
        if (!isCorrect) {
             // 失敗した場合は、現在の入力をログに記録
             errorLog.push({
                 time_s: recallTime, // 確認ボタンを押した時点の秒
                 input_value: userInput, // ユーザーの生入力
                 attempt: currentErrors // 試行回数
             });
        }
        // error_count は、失敗して記録されたログの数 + 成功したなら 0
        currentExperiment.error_count = errorLog.length;
        currentExperiment.is_success = isCorrect;
        currentExperiment.passphrase = currentPassphraseObject.passphrase;
        currentExperiment.error_details = errorLog;
        
        allExperimentResults.push(currentExperiment); // 結果をリストに追加
        
        let nextLanguage;
        // 🚨 修正点 7: 実験フローの変更（en -> jp -> pokemon -> finish） 🚨
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
        
        // 🚨 変更 8: 入力ミスの記録を checkPassphrase の間違い時のみに限定 🚨
        // 間違いの場合、現在の入力をログに記録
        const errorTime = (Date.now() - recallStartTime) / 1000;
        errorLog.push({
            time_s: errorTime, // 確認ボタンを押した時点の秒
            input_value: userInput, // ユーザーの生入力
            attempt: currentErrors // 試行回数
        });
        
        document.getElementById('error-count-display').textContent = MAX_ERRORS - currentErrors;
        document.getElementById('recall-input').value = ''; // 入力欄をクリア
        
        // 🚨 変更 9: エラーメッセージから「文字が異なります」のニュアンスを削除 🚨
        // 以前の修正で「文字が異なります」は削除されていますが、意図したシンプルさであることを再確認
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
