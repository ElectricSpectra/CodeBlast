// --- DOM ELEMENTS ---
const roundDisplay = document.getElementById('round-display');
const questionDisplay = document.getElementById('question-display');
const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
const timerDisplay = document.getElementById('timer-display');
const statusDisplay = document.getElementById('status-display');
const problemDescription = document.getElementById('problem-description');
const codeEditor = document.getElementById('code-editor');
const defuseButton = document.getElementById('defuse-button');
const bombContainer = document.getElementById('bomb-container');
const modalContainer = document.getElementById('modal-container');
const mainModal = document.getElementById('main-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalButtons = document.getElementById('modal-buttons');
const explosionContainer = document.getElementById('explosion-container');
const wireCuttingUI = document.getElementById('wire-cutting-ui');
const languageSelector = document.getElementById('language-selector');
const currentLanguageDisplay = document.getElementById('current-language');
const usernameModal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const authError = document.getElementById('auth-error');
const startGameBtn = document.getElementById('start-game-btn');

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBh84wT5CIkxXOkpC09dmLRfmCD_SGV0IM",
    authDomain: "codeblast-e10aa.firebaseapp.com",
    databaseURL: "https://codeblast-e10aa-default-rtdb.firebaseio.com",
    projectId: "codeblast-e10aa",
    storageBucket: "codeblast-e10aa.firebasestorage.app",
    messagingSenderId: "522975475620",
    appId: "1:522975475620:web:ac791b2d8d40f2d6d7f331",
    measurementId: "G-67LKJ6EEQZ"
};

// Initialize Firebase
let database = null;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
    console.log('Will use localStorage as fallback');
}

// Password constant
const CORRECT_PASSWORD = 'CBAnokha';

// Wire elements
const wires = {
    red: document.getElementById('wire-red'),
    blue: document.getElementById('wire-blue'),
    green: document.getElementById('wire-green'),
    yellow: document.getElementById('wire-yellow')
};

// Wire cut buttons
const wireCutButtons = {
    red: document.getElementById('cut-red'),
    blue: document.getElementById('cut-blue'),
    green: document.getElementById('cut-green'),
    yellow: document.getElementById('cut-yellow')
};

// --- SOUND SYSTEM ---
const sounds = {
    planted:    new Audio('sound/planted.mp3'),
    defused:    new Audio('sound/defused.mp3'),
    bomb:       new Audio('sound/bomb.mp3'),
    finaldeath: new Audio('sound/finaldeath.mp3')
};

function playSound(name) {
    const snd = sounds[name];
    if (!snd) return;
    snd.currentTime = 0;
    snd.play().catch(() => {}); // ignore autoplay policy errors
}

// --- GAME STATE ---
let gameData = null; // Will hold the loaded questions
let currentRound = 0; // 0-indexed
let currentQuestion = 0; // 0-indexed within the round
let lives = 3;
let score = 0;
let timeLeft = 0;
let timerInterval = null;
let isGameActive = false;
let selectedLanguage = 'python'; // Default language
let bombWires = null; // Current bomb state
let correctWire = null; // The safe wire to cut
let questionStartTime = 0; // Track when question started
let username = ''; // Player's username
let correctOutputCache = {}; // Cache for correct code outputs to reduce API calls
let selectedQuestionsPerRound = {}; // Store randomly selected questions for each round

// --- UTILITY FUNCTIONS ---
const normalizeCode = (code) => code.replace(/\s/g, '');

function getRandomWireColor() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// --- PISTON API INTEGRATION ---
const PISTON_API_KEY = '02c2f948-83d8-413a-98a6-f855f0bc1d27';
const PISTON_API_URL = 'https://emkc.org/api/v2/piston/execute';

// Language version mapping for Piston
const languageConfig = {
    'python': { language: 'python', version: '3.10.0' },
    'javascript': { language: 'javascript', version: '18.15.0' },
    'java': { language: 'java', version: '15.0.2' },
    'c': { language: 'c', version: '10.2.0' }
};

// Helper function to add delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executePistonCode(language, code, stdin = '', retryCount = 0) {
    try {
        const config = languageConfig[language];
        if (!config) {
            throw new Error(`Unsupported language: ${language}`);
        }

        const fileName = language === 'python' ? 'main.py' : 
                        language === 'javascript' ? 'main.js' :
                        language === 'java' ? 'Main.java' : 'main.c';

        const response = await fetch(PISTON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': PISTON_API_KEY
            },
            body: JSON.stringify({
                language: config.language,
                version: config.version,
                files: [{
                    name: fileName,
                    content: code
                }],
                stdin: stdin,
                compile_timeout: 10000,
                run_timeout: 3000,
                compile_memory_limit: -1,
                run_memory_limit: -1
            })
        });

        // Handle rate limiting with retry
        if (response.status === 429) {
            const maxRetries = 2;
            if (retryCount < maxRetries) {
                const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(`Rate limited. Retrying in ${waitTime/1000} seconds... (Attempt ${retryCount + 1}/${maxRetries})`);
                await delay(waitTime);
                return executePistonCode(language, code, stdin, retryCount + 1);
            } else {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Piston API Error:', error);
        return { 
            error: error.message,
            run: { code: -1, output: '', stderr: error.message }
        };
    }
}

// Test case wrappers for different question types
function wrapCodeWithTestCases(code, language, questionId) {
    // Define test cases for different questions
    const testCases = {
        // Round 1
        1: { // add function
            python: [
                "print(add(5, 3))",
                "print(add(10, 20))",
                "print(add(-5, 5))"
            ],
            javascript: [
                "console.log(add(5, 3));",
                "console.log(add(10, 20));",
                "console.log(add(-5, 5));"
            ],
            java: [
                "System.out.println(add(5, 3));",
                "System.out.println(add(10, 20));",
                "System.out.println(add(-5, 5));"
            ],
            c: [
                "printf(\"%d\\n\", add(5, 3));",
                "printf(\"%d\\n\", add(10, 20));",
                "printf(\"%d\\n\", add(-5, 5));"
            ]
        },
        2: { // is_even function
            python: [
                "print(is_even(4))",
                "print(is_even(7))",
                "print(is_even(0))"
            ],
            javascript: [
                "console.log(isEven(4));",
                "console.log(isEven(7));",
                "console.log(isEven(0));"
            ],
            java: [
                "System.out.println(isEven(4));",
                "System.out.println(isEven(7));",
                "System.out.println(isEven(0));"
            ],
            c: [
                "printf(\"%d\\n\", isEven(4));",
                "printf(\"%d\\n\", isEven(7));",
                "printf(\"%d\\n\", isEven(0));"
            ]
        },
        3: { // greet function
            python: [
                "print(greet('Alice'))",
                "print(greet('Bob'))"
            ],
            javascript: [
                "console.log(greet('Alice'));",
                "console.log(greet('Bob'));"
            ],
            java: [
                "System.out.println(greet(\"Alice\"));",
                "System.out.println(greet(\"Bob\"));"
            ],
            c: [
                "printf(\"%s\\n\", greet(\"Alice\"));",
                "printf(\"%s\\n\", greet(\"Bob\"));"
            ]
        },
        5: { // getLast function
            python: [
                "print(get_last([1, 2, 3, 4, 5]))",
                "print(get_last([10, 20, 30]))"
            ],
            javascript: [
                "console.log(getLast([1, 2, 3, 4, 5]));",
                "console.log(getLast([10, 20, 30]));"
            ],
            java: [
                "System.out.println(getLast(new int[]{1, 2, 3, 4, 5}));",
                "System.out.println(getLast(new int[]{10, 20, 30}));"
            ],
            c: [
                "int arr1[] = {1, 2, 3, 4, 5}; printf(\"%d\\n\", getLast(arr1, 5));",
                "int arr2[] = {10, 20, 30}; printf(\"%d\\n\", getLast(arr2, 3));"
            ]
        },
        // Round 2
        6: { // isEmpty function
            python: [
                "print(is_empty([]))",
                "print(is_empty([1, 2, 3]))",
                "print(is_empty(''))"
            ],
            javascript: [
                "console.log(isEmpty([]));",
                "console.log(isEmpty([1, 2, 3]));",
                "console.log(isEmpty(''));"
            ],
            java: [
                "System.out.println(isEmpty(\"\"));",
                "System.out.println(isEmpty(\"Hello\"));"
            ],
            c: [
                "printf(\"%d\\n\", isEmpty(\"\"));",
                "printf(\"%d\\n\", isEmpty(\"Hello\"));"
            ]
        },
        7: { // isEqual function
            python: [
                "print(is_equal(5, 5))",
                "print(is_equal(3, 7))",
                "print(is_equal(0, 0))"
            ],
            javascript: [
                "console.log(isEqual(5, 5));",
                "console.log(isEqual(3, 7));",
                "console.log(isEqual(0, 0));"
            ],
            java: [
                "System.out.println(isEqual(5, 5));",
                "System.out.println(isEqual(3, 7));",
                "System.out.println(isEqual(0, 0));"
            ],
            c: [
                "printf(\"%d\\n\", isEqual(5, 5));",
                "printf(\"%d\\n\", isEqual(3, 7));",
                "printf(\"%d\\n\", isEqual(0, 0));"
            ]
        },
        8: { // multiply function
            python: [
                "print(multiply(5, 3))",
                "print(multiply(7, 2))",
                "print(multiply(0, 10))"
            ],
            javascript: [
                "console.log(multiply(5, 3));",
                "console.log(multiply(7, 2));",
                "console.log(multiply(0, 10));"
            ],
            java: [
                "System.out.println(multiply(5, 3));",
                "System.out.println(multiply(7, 2));",
                "System.out.println(multiply(0, 10));"
            ],
            c: [
                "printf(\"%d\\n\", multiply(5, 3));",
                "printf(\"%d\\n\", multiply(7, 2));",
                "printf(\"%d\\n\", multiply(0, 10));"
            ]
        },
        9: { // isPositive function
            python: [
                "print(is_positive(5))",
                "print(is_positive(-3))",
                "print(is_positive(0))"
            ],
            javascript: [
                "console.log(isPositive(5));",
                "console.log(isPositive(-3));",
                "console.log(isPositive(0));"
            ],
            java: [
                "System.out.println(isPositive(5));",
                "System.out.println(isPositive(-3));",
                "System.out.println(isPositive(0));"
            ],
            c: [
                "printf(\"%d\\n\", isPositive(5));",
                "printf(\"%d\\n\", isPositive(-3));",
                "printf(\"%d\\n\", isPositive(0));"
            ]
        },
        10: { // maxNum function
            python: [
                "print(max_num(10, 5))",
                "print(max_num(3, 15))",
                "print(max_num(7, 7))"
            ],
            javascript: [
                "console.log(maxNum(10, 5));",
                "console.log(maxNum(3, 15));",
                "console.log(maxNum(7, 7));"
            ],
            java: [
                "System.out.println(maxNum(10, 5));",
                "System.out.println(maxNum(3, 15));",
                "System.out.println(maxNum(7, 7));"
            ],
            c: [
                "printf(\"%d\\n\", maxNum(10, 5));",
                "printf(\"%d\\n\", maxNum(3, 15));",
                "printf(\"%d\\n\", maxNum(7, 7));"
            ]
        },
        // Round 3
        11: { // copy_list — test that it's an actual copy (modify result, original unchanged)
            python: [
                "lst = [1, 2, 3]\nresult = copy_list(lst)\nresult[0] = 99\nprint(lst[0])\nprint(result[0])"
            ],
            javascript: [
                "const arr = [1, 2, 3];\nconst result = copyArray(arr);\nresult[0] = 99;\nconsole.log(arr[0]);\nconsole.log(result[0]);"
            ],
            java: [
                "int[] arr = {1, 2, 3};\nint[] result = copyArray(arr);\nresult[0] = 99;\nSystem.out.println(arr[0]);\nSystem.out.println(result[0]);"
            ],
            c: [
                "int arr[] = {1, 2, 3}; int* result = copyArray(arr, 3); result[0] = 99; printf(\"%d\\n\", arr[0]); printf(\"%d\\n\", result[0]);"
            ]
        },
        12: { // countdown
            python: [
                "countdown(3)"
            ],
            javascript: [
                "countdown(3);"
            ],
            java: [
                "countdown(3);"
            ],
            c: [
                "countdown(3);"
            ]
        },
        13: { // combine — test result content and that original is unchanged
            python: [
                "lst1 = [1, 2]\nlst2 = [3, 4]\nresult = combine(lst1, lst2)\nprint(result)\nprint(lst1)"
            ],
            javascript: [
                "const a = [1, 2], b = [3, 4];\nconst r = combine(a, b);\nconsole.log(JSON.stringify(r));\nconsole.log(JSON.stringify(a));"
            ],
            java: [
                "List<Integer> l1 = new ArrayList<>(Arrays.asList(1, 2));\nList<Integer> l2 = new ArrayList<>(Arrays.asList(3, 4));\nSystem.out.println(combine(l1, l2));\nSystem.out.println(l1);"
            ],
            c: [
                "int a[]={1,2}; int b[]={3,4}; int* r=combine(a,2,b,2); printf(\"%d %d %d %d\\n\",r[0],r[1],r[2],r[3]); printf(\"%d %d\\n\",a[0],a[1]);"
            ]
        },
        14: { // swap
            python: [
                "print(swap(1, 2))",
                "print(swap(5, 3))"
            ],
            javascript: [
                "console.log(JSON.stringify(swap(1, 2)));",
                "console.log(JSON.stringify(swap(5, 3)));"
            ],
            java: [
                "int[] arr1 = {4, 7}; swap(arr1, 0, 1); System.out.println(arr1[0]); System.out.println(arr1[1]);"
            ],
            c: [
                "int a=4, b=7; swap(&a, &b); printf(\"%d\\n%d\\n\", a, b);"
            ]
        },
        15: { // double_values — test result and original unchanged
            python: [
                "nums = [1, 2, 3]\nresult = double_values(nums)\nprint(result)\nprint(nums)"
            ],
            javascript: [
                "const nums = [1, 2, 3];\nconst result = doubleValues(nums);\nconsole.log(JSON.stringify(result));\nconsole.log(JSON.stringify(nums));"
            ],
            java: [
                "int[] nums = {1, 2, 3};\nint[] result = doubleValues(nums);\nSystem.out.println(Arrays.toString(result));\nSystem.out.println(Arrays.toString(nums));"
            ],
            c: [
                "int nums[]={1,2,3}; int* result=doubleValues(nums,3); printf(\"%d %d %d\\n\",result[0],result[1],result[2]); printf(\"%d %d %d\\n\",nums[0],nums[1],nums[2]);"
            ]
        },
        // Round 4
        17: { // divide
            python: [
                "print(divide(10, 2))",
                "print(divide(10, 0))"
            ],
            javascript: [
                "console.log(divide(10, 2));",
                "console.log(divide(10, 0));"
            ],
            java: [
                "System.out.println(divide(10, 2));",
                "System.out.println(divide(10, 0));"
            ],
            c: [
                "printf(\"%d\\n\", divide(10, 2));",
                "printf(\"%d\\n\", divide(10, 0));"
            ]
        },
        18: { // factorial
            python: [
                "print(factorial(5))",
                "print(factorial(1))"
            ],
            javascript: [
                "console.log(factorial(5));",
                "console.log(factorial(1));"
            ],
            java: [
                "System.out.println(factorial(5));",
                "System.out.println(factorial(1));"
            ],
            c: [
                "printf(\"%d\\n\", factorial(5));",
                "printf(\"%d\\n\", factorial(1));"
            ]
        },
        19: { // copy_str
            python: [
                "print(copy_str('hello'))",
                "print(copy_str('world'))"
            ],
            javascript: [
                "console.log(copyStr('hello'));",
                "console.log(copyStr('world'));"
            ],
            java: [
                "System.out.println(copyStr(\"hello\"));",
                "System.out.println(copyStr(\"world\"));"
            ],
            c: [
                "char dest[20]; copyString(dest, \"hello\"); printf(\"%s\\n\", dest);",
                "char dest2[20]; copyString(dest2, \"world\"); printf(\"%s\\n\", dest2);"
            ]
        },
        // Round 5
        21: { // isPalindrome
            python: [
                "print(is_palindrome('racecar'))",
                "print(is_palindrome('A man a plan a canal Panama'))",
                "print(is_palindrome('hello'))"
            ],
            javascript: [
                "console.log(isPalindrome('racecar'));",
                "console.log(isPalindrome('A man a plan a canal Panama'));",
                "console.log(isPalindrome('hello'));"
            ],
            java: [
                "System.out.println(isPalindrome(\"racecar\"));",
                "System.out.println(isPalindrome(\"A man a plan a canal Panama\"));",
                "System.out.println(isPalindrome(\"hello\"));"
            ],
            c: [
                "printf(\"%d\\n\", isPalindrome(\"racecar\"));",
                "printf(\"%d\\n\", isPalindrome(\"racecar\"));",
                "printf(\"%d\\n\", isPalindrome(\"hello\"));"
            ]
        },
        23: { // isInRange
            python: [
                "print(is_in_range(15, 10, 20))",
                "print(is_in_range(5, 10, 20))",
                "print(is_in_range(25, 10, 20))"
            ],
            javascript: [
                "console.log(isInRange(15, 10, 20));",
                "console.log(isInRange(5, 10, 20));",
                "console.log(isInRange(25, 10, 20));"
            ],
            java: [
                "System.out.println(isInRange(15, 10, 20));",
                "System.out.println(isInRange(5, 10, 20));",
                "System.out.println(isInRange(25, 10, 20));"
            ],
            c: [
                "printf(\"%d\\n\", isInRange(15, 10, 20));",
                "printf(\"%d\\n\", isInRange(5, 10, 20));",
                "printf(\"%d\\n\", isInRange(25, 10, 20));"
            ]
        },
        24: { // initArray
            python: [
                "print(init_array(5))",
                "print(init_array(3))"
            ],
            javascript: [
                "console.log(JSON.stringify(initArray(5)));",
                "console.log(JSON.stringify(initArray(3)));"
            ],
            java: [
                "System.out.println(Arrays.toString(initArray(5)));",
                "System.out.println(Arrays.toString(initArray(3)));"
            ],
            c: [
                "int* r=initArray(5); if(r){int i; for(i=0;i<5;i++) printf(\"%d \",r[i]); printf(\"\\n\");}",
                "int* r2=initArray(3); if(r2){int i; for(i=0;i<3;i++) printf(\"%d \",r2[i]); printf(\"\\n\");}"
            ]
        }
    };

    // Check if this question needs test case wrapping
    if (testCases[questionId] && testCases[questionId][language]) {
        const tests = testCases[questionId][language];
        
        // Wrap based on language
        if (language === 'python') {
            return `${code}\n\n# Test cases\n${tests.join('\n')}`;
        } else if (language === 'javascript') {
            return `${code}\n\n// Test cases\n${tests.join('\n')}`;
        } else if (language === 'java') {
            return `public class Main {\n${code}\n\npublic static void main(String[] args) {\nMain m = new Main();\n${tests.join('\n')}\n}\n}`;
        } else if (language === 'c') {
            return `#include <stdio.h>\n#include <string.h>\n\n${code}\n\nint main() {\n${tests.join('\n')}\nreturn 0;\n}`;
        }
    }
    
    // For questions without defined test cases, add main wrapper if needed
    if (language === 'c' && !code.includes('main')) {
        return `#include <stdio.h>\n\nint main() {\n${code}\nreturn 0;\n}`;
    }
    
    return code;
}

// Get all possible solutions from the question data
function getPossibleSolutions(questionData, language) {
    const langData = questionData.languages[language];
    
    // If possibleSolutions exist in JSON, use them
    if (langData.possibleSolutions && Array.isArray(langData.possibleSolutions)) {
        return langData.possibleSolutions;
    }
    
    // Fallback to just the correctCode if no possibleSolutions defined
    return [langData.correctCode];
}

// Randomly select 5 questions from a round's questions
function selectRandomQuestions(roundQuestions, count = 5) {
    // If round has count or fewer questions, return all
    if (roundQuestions.length <= count) {
        return roundQuestions;
    }
    
    // Shuffle and pick the specified count
    const shuffled = [...roundQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

async function validateCodeWithExecution(userCode, correctCode, language, questionData) {
    // Step 1: Try string matching against known correct solutions
    const possibleSolutions = getPossibleSolutions(questionData, language);
    const normalizedUserCode = normalizeCode(userCode);
    
    // Check if user code matches any known solution
    for (const solution of possibleSolutions) {
        if (normalizedUserCode === normalizeCode(solution)) {
            console.log('✓ Code matches known solution (no API call needed)');
            return {
                success: true,
                message: 'Code matches known solution!',
                userOutput: 'Validated by string matching',
                method: 'string-match'
            };
        }
    }
    
    console.log('✗ No string match found. Validating with Piston API...');
    
    // Step 2: If no string match, validate with Piston API
    const questionId = questionData.id;
    
    // Wrap code with test cases if needed
    const wrappedUserCode = wrapCodeWithTestCases(userCode, language, questionId);
    const wrappedCorrectCode = wrapCodeWithTestCases(correctCode, language, questionId);
    
    // Cache key for correct outputs (questionId + language)
    const cacheKey = `q${questionId}_${language}`;
    
    // Execute user code and get/cache correct code output
    let correctResult;
    let userResult;
    
    // Check if we have cached correct output
    if (correctOutputCache[cacheKey]) {
        console.log('Using cached correct output for', cacheKey);
        // Only execute user code
        userResult = await executePistonCode(language, wrappedUserCode);
        correctResult = correctOutputCache[cacheKey];
    } else {
        console.log('Executing both user and correct code (no cache)');
        // Execute both and cache the correct result
        [userResult, correctResult] = await Promise.all([
            executePistonCode(language, wrappedUserCode),
            executePistonCode(language, wrappedCorrectCode)
        ]);
        // Cache the correct result for future use
        correctOutputCache[cacheKey] = correctResult;
    }

    console.log('User Result:', userResult);
    console.log('Correct Result:', correctResult);

    // Check if user code has compilation errors
    if (userResult.compile && userResult.compile.code !== 0) {
        return {
            success: false,
            message: 'Code compilation failed!',
            userOutput: userResult.compile.stderr || userResult.compile.output || 'Compilation error',
            isError: true,
            method: 'api'
        };
    }

    // Check if user code has runtime errors
    if (userResult.error || (userResult.run && userResult.run.code !== 0)) {
        return {
            success: false,
            message: 'Code execution failed!',
            userOutput: userResult.run?.stderr || userResult.run?.output || userResult.error || 'Runtime error',
            isError: true,
            method: 'api'
        };
    }

    // Compare outputs
    const userOutput = (userResult.run?.output || '').trim();
    const correctOutput = (correctResult.run?.output || '').trim();

    console.log('User Output:', userOutput);
    console.log('Expected Output:', correctOutput);

    // Safety guard: if both produce no output, test cases didn't run — cannot validate
    if (userOutput === '' && correctOutput === '') {
        return {
            success: false,
            message: 'Code produced no output. Your fix may be incomplete.',
            userOutput: '(no output)',
            expectedOutput: '(no output)',
            method: 'api'
        };
    }

    if (userOutput === correctOutput) {
        return {
            success: true,
            message: 'Code executed successfully! Output matches expected result.',
            userOutput: userOutput,
            method: 'api'
        };
    } else {
        // Also check if code is exactly the same (fallback)
        if (normalizeCode(userCode) === normalizeCode(correctCode)) {
            return {
                success: true,
                message: 'Code matches the solution exactly!',
                userOutput: userOutput,
                method: 'string'
            };
        }
        
        return {
            success: false,
            message: 'Output does not match expected result!',
            userOutput: userOutput,
            expectedOutput: correctOutput,
            method: 'api'
        };
    }
}

// =====================================================================
// SECRET ROUND 2.5 — Music Aura (JioSaavn Challenge)
// =====================================================================

function triggerSecretRound() {
    // Save current game state to localStorage so game.html can read it and return here
    localStorage.setItem('codeBlaster_score', score.toString());
    localStorage.setItem('codeBlaster_username', username);
    localStorage.setItem('codeBlaster_secretRoundPending', 'true');

    playSound('defused');
    modalTitle.textContent = '🎵 SECRET ROUND UNLOCKED! 🎵';
    modalTitle.className = 'text-4xl font-bold mb-4' + ' ' + 'text-purple-400' + ' secret-round-title';
    modalTitle.style.cssText = 'color: #c084fc; text-shadow: 0 0 20px rgba(192,132,252,0.8);';
    modalMessage.innerHTML = `
        <div style="color:#a78bfa;font-weight:bold;font-size:1.15rem;margin-bottom:12px;">⚡ ROUND 2.5 — JioSaavn Challenge</div>
        <div style="color:#d1d5db;margin-bottom:8px;">A hidden bonus round has appeared!</div>
        <div style="color:#fbbf24;">Complete it to earn <span style="color:#c084fc;font-weight:bold;">🎵 Music Aura</span> and <strong>+500 bonus points</strong>!</div>
        <div style="margin-top:14px;color:#86efac;">Your score so far: <span style="color:#67e8f9;font-weight:bold;">${score}</span></div>
        <div style="color:#6b7280;font-size:0.85rem;margin-top:6px;">(Your progress is saved — you'll return here afterwards)</div>
    `;

    modalButtons.innerHTML = '';

    const enterBtn = document.createElement('button');
    enterBtn.innerHTML = '🎵 Enter Secret Round';
    enterBtn.className = 'w-full p-3 font-bold rounded-lg transition-all text-white';
    enterBtn.style.cssText = 'background: linear-gradient(135deg, #7c3aed, #db2777); box-shadow: 0 0 20px rgba(168,85,247,0.5);';
    enterBtn.onclick = () => { window.location.href = 'game.html'; };
    modalButtons.appendChild(enterBtn);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip (forfeit Music Aura)';
    skipBtn.className = 'w-full p-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-lg transition-all mt-2';
    skipBtn.onclick = () => {
        localStorage.removeItem('codeBlaster_secretRoundPending');
        localStorage.removeItem('codeBlaster_score');
        localStorage.removeItem('codeBlaster_username');
        hideModals();
        loadQuestion();
    };
    modalButtons.appendChild(skipBtn);

    showModal();
}

function checkMusicAuraReturn() {
    const pending = localStorage.getItem('codeBlaster_secretRoundPending');
    if (pending !== 'true') return false;

    const savedScore    = localStorage.getItem('codeBlaster_score');
    const savedUsername = localStorage.getItem('codeBlaster_username');
    const musicAura     = localStorage.getItem('codeBlaster_musicAura');

    // Restore game state
    if (savedScore)    score    = parseInt(savedScore) || 0;
    if (savedUsername) username = savedUsername;
    currentRound    = 2;   // proceed to round 3 (0-indexed)
    currentQuestion = 0;

    // Clear recovery keys
    localStorage.removeItem('codeBlaster_secretRoundPending');
    localStorage.removeItem('codeBlaster_score');
    localStorage.removeItem('codeBlaster_username');

    if (musicAura === 'true') {
        localStorage.removeItem('codeBlaster_musicAura');
        score += 500; // music aura bonus
        return 'music';
    }
    return 'normal';
}

function applyMusicTheme() {
    // Inject music-themed overrides
    const style = document.createElement('style');
    style.id = 'music-theme-style';
    style.textContent = `
        body { background: #0d0020 !important; }
        .border-green-500\/50, .border-green-500 { border-color: rgba(168,85,247,0.5) !important; }
        #timer-overlay { border-color: #a855f7 !important; box-shadow: 0 0 20px rgba(168,85,247,0.5), inset 0 0 10px rgba(168,85,247,0.2) !important; }
        #timer-display { color: #c084fc !important; text-shadow: 0 0 10px rgba(168,85,247,0.8), 0 0 20px rgba(168,85,247,0.4) !important; }
        h1.text-green-400 { color: #c084fc !important; text-shadow: 0 0 10px rgba(192,132,252,0.8), 0 0 20px rgba(192,132,252,0.4) !important; }
        .text-green-400 { color: #c084fc !important; }
        .text-green-300 { color: #e879f9 !important; }
        .bg-green-600  { background-color: #7c3aed !important; }
        #defuse-button { background-color: #7c3aed !important; box-shadow: 0 0 20px rgba(124,58,237,0.6) !important; }
        #defuse-button:hover { background-color: #6d28d9 !important; }
        .music-aura-banner { position:fixed; top:0; left:0; right:0; z-index:9999;
            background: linear-gradient(90deg,#7c3aed,#db2777,#f59e0b,#db2777,#7c3aed);
            background-size:300% 100%;
            animation: bannerScroll 4s linear infinite;
            color:#fff; text-align:center; padding:7px 0; font-weight:bold;
            font-family:monospace; letter-spacing:3px; font-size:0.82rem;
            text-shadow:0 0 8px rgba(0,0,0,0.6); }
        @keyframes bannerScroll { 0%{background-position:0%} 100%{background-position:300%} }
        .music-float-note { position:fixed; pointer-events:none; font-size:1.4rem;
            animation:floatNote ease-in-out forwards; z-index:9998; opacity:0; }
        @keyframes floatNote {
            0%  { opacity:0;   transform:translateY(0)   rotate(0deg); }
            20% { opacity:0.7; }
            100%{ opacity:0;   transform:translateY(-110px) rotate(25deg); } }
    `;
    document.head.appendChild(style);

    // Persistent banner
    const banner = document.createElement('div');
    banner.className = 'music-aura-banner';
    banner.innerHTML = '🎵 &nbsp; MUSIC AURA ACTIVE &nbsp;·&nbsp; Powered by JioSaavn &nbsp; 🎵';
    document.body.insertBefore(banner, document.body.firstChild);

    // Show a toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:50px;left:50%;transform:translateX(-50%);
        background:linear-gradient(135deg,#7c3aed,#db2777); color:#fff;
        padding:14px 28px; border-radius:12px; font-weight:bold; font-size:1rem;
        z-index:10000; box-shadow:0 8px 32px rgba(168,85,247,0.5);
        animation:toastIn .4s ease; letter-spacing:1px; white-space:nowrap;`;
    toast.innerHTML = '🎵 +500 Music Aura Bonus! JioSaavn unlocked!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);

    // Spawn floating notes periodically
    const noteChars = ['♪','♫','♬','🎵','🎶','🎸','🎹','🎤'];
    setInterval(() => {
        const note = document.createElement('div');
        note.className = 'music-float-note';
        note.textContent = noteChars[Math.floor(Math.random() * noteChars.length)];
        note.style.left  = (Math.random() * 94) + '%';
        note.style.bottom = Math.floor(Math.random() * 30 + 60) + 'px';
        note.style.animationDuration = (3 + Math.random() * 3) + 's';
        document.body.appendChild(note);
        setTimeout(() => note.remove(), 6500);
    }, 900);
}

function updateLivesDisplay() {
    livesDisplay.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const life = document.createElement('span');
        life.textContent = '■';
        life.classList.add('life-heart', 'transition-all', 'duration-300', 'text-2xl');
        if (i >= lives) {
            life.classList.add('lost');
            life.style.color = '#333';
            life.style.textShadow = 'none';
        } else {
            life.style.color = '#00ff00';
            life.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.8)';
        }
        livesDisplay.appendChild(life);
    }
}

function updateScoreDisplay() {
    scoreDisplay.textContent = score;
}

function updateTimerDisplay() {
    timerDisplay.textContent = timeLeft;
}

// --- WIRE MECHANICS ---
function initializeBombWires() {
    // Reset all wires
    Object.values(wires).forEach(wire => {
        if (wire) {
            wire.classList.remove('cut', 'safe');
            wire.style.display = 'block';
            wire.style.opacity = '1';
        }
    });
    
    // Choose a random correct wire
    correctWire = getRandomWireColor();
    console.log('Correct wire:', correctWire); // Debug
    
    // Add click listeners to buttons
    Object.entries(wireCutButtons).forEach(([color, button]) => {
        if (button) {
            button.onclick = () => cutWire(color);
            button.disabled = false;
        }
    });
}

function createSparks(x, y, color) {
    const sparkContainer = document.getElementById('spark-container');
    if (!sparkContainer) {
        console.error('Spark container not found!');
        return;
    }
    sparkContainer.classList.remove('hidden');
    
    // Create 8-12 sparks
    const sparkCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
        const distance = 20 + Math.random() * 30;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        spark.setAttribute('cx', x);
        spark.setAttribute('cy', y);
        spark.setAttribute('r', 2 + Math.random() * 2);
        spark.setAttribute('fill', color);
        spark.setAttribute('filter', 'url(#wire-glow)');
        spark.classList.add('spark');
        spark.style.setProperty('--tx', `${tx}px`);
        spark.style.setProperty('--ty', `${ty}px`);
        
        sparkContainer.appendChild(spark);
        
        // Remove spark after animation
        setTimeout(() => {
            spark.remove();
        }, 600);
    }
    
    // Create electric arcs
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const offset = (Math.random() - 0.5) * 20;
            const curve = 10 + Math.random() * 15;
            arc.setAttribute('d', `M ${x} ${y} Q ${x + offset} ${y - curve} ${x + offset * 2} ${y - 20}`);
            arc.setAttribute('stroke', '#60A5FA');
            arc.setAttribute('stroke-width', '2');
            arc.setAttribute('fill', 'none');
            arc.classList.add('electric-arc');
            sparkContainer.appendChild(arc);
            
            setTimeout(() => arc.remove(), 400);
        }, i * 100);
    }
    
    setTimeout(() => {
        sparkContainer.classList.add('hidden');
    }, 1000);
}

function cutWire(color) {
    console.log('Cutting wire:', color, 'Correct wire:', correctWire); // Debug
    
    // Disable all wire cut buttons
    Object.values(wireCutButtons).forEach(button => {
        if (button) {
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
        }
    });
    
    // Get wire positions for spark effects - adjusted for new bomb layout
    const sparkPositions = {
        red: { x: 20, y: 0 },
        blue: { x: 40, y: 0 },
        green: { x: 60, y: 0 },
        yellow: { x: 80, y: 0 }
    };
    
    const wireColors = {
        red: '#EF4444',
        blue: '#3B82F6',
        green: '#22C55E',
        yellow: '#EAB308'
    };
    
    // Create spark effect at wire connection point
    const pos = sparkPositions[color];
    createSparks(pos.x, pos.y, wireColors[color]);
    
    // Animate the wire cut
    const wire = wires[color];
    if (wire) {
        wire.classList.add('cut');
    } else {
        console.error('Wire not found:', color);
    }
    
    setTimeout(() => {
        if (color === correctWire) {
            // Safe wire! Show success
            showSuccessFlash();
            wireCuttingUI.classList.add('hidden');
            loadNextQuestion();
        } else {
            // Wrong wire! Explosion
            handleExplosion();
        }
    }, 800);
}

function showWireCuttingUI() {
    wireCuttingUI.classList.remove('hidden');
    // Enable all buttons
    Object.values(wireCutButtons).forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
    });
}

function hideWireCuttingUI() {
    wireCuttingUI.classList.add('hidden');
}

// --- GAME LOGIC FUNCTIONS ---
async function loadQuestionsData() {
    try {
        const response = await fetch('questions.json');
        gameData = await response.json();
        console.log('Questions loaded:', gameData);
        
        // For each round, select random questions if there are more than 5
        gameData.rounds.forEach((round, index) => {
            const totalQuestions = round.questions.length;
            const questionsToSelect = Math.min(5, totalQuestions);
            
            // If there are more than 5 questions, select 5 randomly
            if (totalQuestions > questionsToSelect) {
                selectedQuestionsPerRound[index] = selectRandomQuestions(round.questions, questionsToSelect);
                console.log(`Round ${index + 1}: Selected ${questionsToSelect} random questions from ${totalQuestions}`);
            } else {
                // Use all questions
                selectedQuestionsPerRound[index] = round.questions;
            }
        });
    } catch (error) {
        console.error('Failed to load questions:', error);
        alert('Failed to load game data. Please refresh the page.');
    }
}

function getCurrentQuestionData() {
    if (!gameData) return null;
    
    // Use selected questions if they exist, otherwise fall back to all questions
    const roundQuestions = selectedQuestionsPerRound[currentRound] || gameData.rounds[currentRound].questions;
    const question = roundQuestions[currentQuestion];
    return question;
}

function loadQuestion() {
    const questionData = getCurrentQuestionData();
    if (!questionData) {
        // No more questions - game completed!
        winGame();
        return;
    }
    
    isGameActive = true;
    const round = gameData.rounds[currentRound];
    
    // Update displays
    roundDisplay.textContent = currentRound + 1;
    questionDisplay.textContent = currentQuestion + 1;
    problemDescription.textContent = questionData.problem;
    
    // Get code for selected language
    const langData = questionData.languages[selectedLanguage];
    codeEditor.value = langData.buggyCode;
    currentLanguageDisplay.textContent = `(${selectedLanguage.toUpperCase()})`;
    
    // Set timer
    timeLeft = questionData.baseTime;
    questionStartTime = Date.now();
    
    // Initialize bomb wires
    initializeBombWires();
    hideWireCuttingUI();
    
    updateTimerDisplay();
    updateLivesDisplay();
    updateScoreDisplay();
    
    statusDisplay.textContent = 'Active';
    statusDisplay.className = 'font-bold text-green-400';
    defuseButton.disabled = false;

    // Play bomb-planted sound at the start of each round (first question)
    if (currentQuestion === 0) {
        playSound('planted');
    }
    bombContainer.classList.remove('shake');
    
    startTimer();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft <= 10 && timeLeft > 0) {
            bombContainer.classList.add('shake');
        }
        
        if (timeLeft <= 0) {
            handleTimeout();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    bombContainer.classList.remove('shake');
}

function calculateScore() {
    const timeElapsed = Math.floor((Date.now() - questionStartTime) / 1000);
    const questionData = getCurrentQuestionData();
    const baseTime = questionData.baseTime;
    
    // Score based on time: faster = more points
    // Max points: 1000, Min points: 100
    const timeRatio = Math.max(0, (baseTime - timeElapsed) / baseTime);
    const points = Math.floor(100 + (timeRatio * 900));
    
    return Math.max(100, points);
}

async function checkCode() {
    if (!isGameActive) return;
    
    stopTimer();
    const questionData = getCurrentQuestionData();
    const langData = questionData.languages[selectedLanguage];
    
    const userCode = codeEditor.value;
    const correctCode = langData.correctCode;
    
    // Show loading state
    defuseButton.disabled = true;
    defuseButton.textContent = '[ EXECUTING CODE... ]';
    statusDisplay.textContent = 'Validating...';
    statusDisplay.className = 'font-bold text-yellow-400';
    
    try {
        // Validate code using hybrid validation (string matching + Piston API)
        const validationResult = await validateCodeWithExecution(userCode, correctCode, selectedLanguage, questionData);
        
        if (validationResult.success) {
            // Correct! Award points and move on
            isGameActive = false;
            const points = calculateScore();
            score += points;
            updateScoreDisplay();
            
            showSuccessFlash();
            defuseButton.textContent = '[ DEFUSE CODE ]';
            statusDisplay.textContent = 'Defused!';
            statusDisplay.className = 'font-bold text-cyan-400';
            
            setTimeout(() => {
                loadNextQuestion();
            }, 1500);
        } else {
            // Wrong answer - must cut a wire!
            isGameActive = false;
            defuseButton.textContent = '[ DEFUSE CODE ]';
            statusDisplay.textContent = 'Failed!';
            statusDisplay.className = 'font-bold text-red-500';
            
            // Log the error for debugging
            console.log('Code validation failed:', validationResult);
            
            showWireCuttingUI();
        }
    } catch (error) {
        console.error('Code execution error:', error);
        // On error, treat as wrong answer
        isGameActive = false;
        defuseButton.textContent = '[ DEFUSE CODE ]';
        statusDisplay.textContent = 'Error!';
        statusDisplay.className = 'font-bold text-red-500';
        showWireCuttingUI();
    }
}

function handleTimeout() {
    stopTimer();
    isGameActive = false;
    defuseButton.disabled = true;
    statusDisplay.textContent = 'Time Out!';
    statusDisplay.className = 'font-bold text-red-500';
    
    // Must cut a wire
    showWireCuttingUI();
}

function handleExplosion() {
    lives--;
    updateLivesDisplay();
    
    // Show explosion effect
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosionContainer.appendChild(explosion);
    setTimeout(() => explosion.remove(), 600);
    
    hideWireCuttingUI();
    
    if (lives <= 0) {
        // All lives gone — play final death sound then game over
        playSound('finaldeath');
        gameOver();
    } else {
        // Still alive — play bomb blast sound
        playSound('bomb');
        // Still have lives, load next question
        setTimeout(() => {
            loadNextQuestion();
        }, 1500);
    }
}

function loadNextQuestion() {
    currentQuestion++;
    
    // Use selected questions count if available, else fall back to full round length
    const roundLen = (selectedQuestionsPerRound[currentRound] || gameData.rounds[currentRound].questions).length;
    // Check if we've completed the round
    if (currentQuestion >= roundLen) {
        currentQuestion = 0;
        currentRound++;
        
        // Check if we've completed all rounds
        if (currentRound >= gameData.rounds.length) {
            winGame();
            return;
        }
        
        // Show round completion message
        showRoundComplete();
        return;
    }
    
    // Load next question in same round
    loadQuestion();
}

function showRoundComplete() {
    playSound('defused');
    // After round 2 completes (currentRound just became 2), launch the secret round
    if (currentRound === 2) {
        triggerSecretRound();
        return;
    }
    const round = gameData.rounds[currentRound - 1];
    modalTitle.textContent = `Round ${currentRound} Complete! 🎉`;
    modalTitle.className = 'text-4xl font-bold mb-4 text-green-400';
    modalMessage.textContent = `Excellent work! Score: ${score}. Get ready for ${gameData.rounds[currentRound].description}`;
    
    modalButtons.innerHTML = '';
    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue to Next Round';
    continueBtn.className = 'w-full p-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all';
    continueBtn.onclick = () => {
        hideModals();
        loadQuestion();
    };
    modalButtons.appendChild(continueBtn);
    
    showModal();
}

async function gameOver() {
    isGameActive = false;
    stopTimer();
    hideWireCuttingUI();
    
    // Save score
    await saveScore();
    
    // Get leaderboard
    const leaderboard = await getLeaderboard();
    const leaderboardHTML = createLeaderboardHTML(leaderboard, score, username);
    
    modalTitle.textContent = 'GAME OVER 💥';
    modalTitle.className = 'text-4xl font-bold mb-4 text-red-500';
    modalMessage.innerHTML = `<div class="text-green-300 mb-4">Agent: <span class="text-green-400 font-bold">${username}</span></div><div class="text-red-400">The bomb exploded!</div><div class="text-green-300 mt-2">Round ${currentRound + 1}, Question ${currentQuestion + 1}</div><div class="text-green-400 font-bold text-2xl mt-4">Final Score: ${score}</div>${leaderboardHTML}`;
    
    modalButtons.innerHTML = '';
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'w-full p-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg';
    closeBtn.onclick = () => hideModals();
    modalButtons.appendChild(closeBtn);
    
    showModal();
}

async function winGame() {
    isGameActive = false;
    stopTimer();
    hideWireCuttingUI();
    
    // Save score
    await saveScore();
    
    // Get leaderboard
    const leaderboard = await getLeaderboard();
    const leaderboardHTML = createLeaderboardHTML(leaderboard, score, username);
    
    modalTitle.textContent = 'MASTER DEFUSER! 🏆';
    modalTitle.className = 'text-4xl font-bold mb-4 text-green-400';
    modalMessage.innerHTML = `<div class="text-green-300 mb-4">Agent: <span class="text-green-400 font-bold">${username}</span></div><div class="text-green-400">Incredible! You've defused all bombs!</div><div class="text-green-400 font-bold text-3xl mt-4">Final Score: ${score}</div>${leaderboardHTML}`;
    
    modalButtons.innerHTML = '';
    
    // Celebrate button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Celebrate! 🎉';
    closeBtn.className = 'w-full p-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg';
    closeBtn.onclick = () => hideModals();
    modalButtons.appendChild(closeBtn);
    
    showModal();
}

function showSuccessFlash() {
    const flash = document.createElement('div');
    flash.className = 'success-flash';
    explosionContainer.appendChild(flash);
    setTimeout(() => flash.remove(), 800);
}

function showModal() {
    modalContainer.classList.remove('hidden');
    modalContainer.classList.add('flex');
    mainModal.classList.remove('hidden');
    mainModal.classList.add('modal-enter');
}

function hideModals() {
    modalContainer.classList.add('modal-leave');
    setTimeout(() => {
        modalContainer.classList.remove('flex', 'modal-leave');
        modalContainer.classList.add('hidden');
        mainModal.classList.add('hidden');
        usernameModal.classList.add('hidden');
    }, 300);
}

function showUsernameModal() {
    modalContainer.classList.remove('hidden');
    modalContainer.classList.add('flex');
    usernameModal.classList.remove('hidden');
    usernameModal.classList.add('modal-enter');
    usernameInput.value = '';
    usernameInput.focus();
}

function hideUsernameModal() {
    usernameModal.classList.add('hidden');
    modalContainer.classList.add('hidden');
    modalContainer.classList.remove('flex');
}

async function saveScore() {
    if (!username) return;
    
    const scoreData = {
        username: username,
        score: score,
        round: currentRound + 1,
        question: currentQuestion + 1,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleString()
    };
    
    try {
        if (database) {
            // Save to Firebase Realtime Database
            const scoresRef = database.ref('scores');
            await scoresRef.push(scoreData);
            console.log('Score saved to Firebase:', scoreData);
        } else {
            throw new Error('Firebase not initialized');
        }
    } catch (error) {
        console.error('Error saving score to Firebase:', error);
        // Fallback: save to localStorage
        const allScores = JSON.parse(localStorage.getItem('codeDefuserScores') || '[]');
        allScores.push(scoreData);
        localStorage.setItem('codeDefuserScores', JSON.stringify(allScores));
        console.log('Score saved to localStorage as fallback');
    }
}

async function getLeaderboard() {
    try {
        if (database) {
            const scoresRef = database.ref('scores');
            const snapshot = await scoresRef.once('value');
            const scoresData = snapshot.val();
            
            if (!scoresData) return [];
            
            // Convert to array and sort by score (highest first)
            const scoresArray = Object.values(scoresData);
            scoresArray.sort((a, b) => b.score - a.score);
            
            return scoresArray;
        } else {
            // Fallback to localStorage
            const allScores = JSON.parse(localStorage.getItem('codeDefuserScores') || '[]');
            allScores.sort((a, b) => b.score - a.score);
            return allScores;
        }
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}

function createLeaderboardHTML(leaderboard, currentScore, currentUsername) {
    if (!leaderboard || leaderboard.length === 0) {
        return '<div class="text-green-500/70 text-sm">No scores yet. You\'re the first!</div>';
    }
    
    // Find current player's rank
    let currentRank = -1;
    for (let i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i].username === currentUsername && 
            leaderboard[i].score === currentScore && 
            leaderboard[i].timestamp === leaderboard.find(s => s.username === currentUsername && s.score === currentScore)?.timestamp) {
            currentRank = i + 1;
            break;
        }
    }
    
    // Show top 10
    const top10 = leaderboard.slice(0, 10);
    
    let html = '<div class="mt-4 max-h-64 overflow-y-auto">';
    html += '<div class="text-green-400 font-bold text-lg mb-3" style="text-shadow: 0 0 10px rgba(0, 255, 0, 0.8);">🏆 LEADERBOARD 🏆</div>';
    html += '<div class="space-y-2">';
    
    top10.forEach((entry, index) => {
        const rank = index + 1;
        const isCurrentPlayer = rank === currentRank;
        const bgClass = isCurrentPlayer ? 'bg-green-900/40 border-2 border-green-400' : 'bg-black/40 border border-green-500/30';
        const textClass = isCurrentPlayer ? 'text-green-300 font-bold' : 'text-green-400/80';
        const shadowStyle = isCurrentPlayer ? 'box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);' : '';
        
        html += `<div class="flex justify-between items-center p-2 rounded ${bgClass}" style="${shadowStyle}">`;
        html += `<div class="flex items-center gap-3">`;
        html += `<span class="font-mono ${textClass}" style="min-width: 30px;">#${rank}</span>`;
        html += `<span class="font-mono ${textClass}">${entry.username}</span>`;
        if (isCurrentPlayer) html += `<span class="text-xs text-green-300">← YOU</span>`;
        html += `</div>`;
        html += `<div class="font-bold ${textClass}">${entry.score}</div>`;
        html += `</div>`;
    });
    
    html += '</div>';
    
    // Show current player's rank if not in top 10
    if (currentRank > 10) {
        html += `<div class="mt-3 p-2 bg-green-900/40 border-2 border-green-400 rounded text-green-300 font-bold" style="box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);">`;
        html += `<div class="flex justify-between items-center">`;
        html += `<div class="flex items-center gap-3">`;
        html += `<span class="font-mono">#${currentRank}</span>`;
        html += `<span class="font-mono">${currentUsername}</span>`;
        html += `<span class="text-xs">← YOU</span>`;
        html += `</div>`;
        html += `<div class="font-bold">${currentScore}</div>`;
        html += `</div>`;
        html += `</div>`;
    }
    
    html += '</div>';
    
    return html;
}

// --- EVENT LISTENERS ---
defuseButton.addEventListener('click', checkCode);

languageSelector.addEventListener('change', (e) => {
    const newLang = e.target.value;
    
    if (newLang === 'all') {
        // Random selection
        const langs = ['python', 'javascript', 'java', 'c'];
        selectedLanguage = langs[Math.floor(Math.random() * langs.length)];
    } else {
        selectedLanguage = newLang;
    }
    
    // Reload current question with new language
    if (isGameActive) {
        const questionData = getCurrentQuestionData();
        const langData = questionData.languages[selectedLanguage];
        codeEditor.value = langData.buggyCode;
        currentLanguageDisplay.textContent = `(${selectedLanguage.toUpperCase()})`;
    }
});

// --- INITIALIZE GAME ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadQuestionsData();
    if (gameData) {
        updateLivesDisplay();

        // Check if we're returning from the secret round (game.html)
        const auraStatus = checkMusicAuraReturn();
        if (auraStatus) {
            // Returning from secret round — skip login, restore state and continue
            if (auraStatus === 'music') {
                applyMusicTheme();
            } else {
                // Skipped or failed secret round — small notification
                const note = document.createElement('div');
                note.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);
                    background:#1f2937;color:#9ca3af;padding:10px 24px;
                    border-radius:8px;font-size:0.85rem;z-index:10000;border:1px solid #374151;`;
                note.textContent = 'Secret Round skipped — no Music Aura this time.';
                document.body.appendChild(note);
                setTimeout(() => note.remove(), 3500);
            }
            updateScoreDisplay();
            loadQuestion();
        } else {
            // Normal startup — show login modal
            showUsernameModal();
        }
    }
});

// Start game button handler
startGameBtn.addEventListener('click', () => {
    const inputUsername = usernameInput.value.trim();
    const inputPassword = passwordInput.value;
    
    // Validate username
    if (inputUsername.length === 0) {
        usernameInput.style.borderColor = '#EF4444';
        usernameInput.placeholder = 'USERNAME REQUIRED!';
        setTimeout(() => {
            usernameInput.style.borderColor = '';
            usernameInput.placeholder = 'ENTER USERNAME...';
        }, 1500);
        return;
    }
    
    // Validate password
    if (inputPassword !== CORRECT_PASSWORD) {
        authError.classList.remove('hidden');
        passwordInput.style.borderColor = '#EF4444';
        passwordInput.value = '';
        setTimeout(() => {
            authError.classList.add('hidden');
            passwordInput.style.borderColor = '';
        }, 2000);
        return;
    }
    
    username = inputUsername;
    hideUsernameModal();
    loadQuestion();
});

// Allow Enter key to submit username and password
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        passwordInput.focus();
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startGameBtn.click();
    }
});
