const textArea = document.getElementById("importArea");
async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    textArea.value = trimmedText;
    textArea.dispatchEvent(new Event('input'));
    
}
document.getElementById("importFile").addEventListener("input", modifyImportArea)

function generateLines(text) {
    var newLines = [];
    for (const [index, line] of text.split('\n').entries()){
        newLines.push({
            text: line,
            recording: null
        })
    }
    return newLines;
}


let mediaRecorder = null; // Stores the MediaRecorder instance
let audioChunks = [];    // Stores chunks of audio data during recording
let audioStream = null;  // Stores the MediaStream from the microphone

/**
 * Requests microphone access and then starts the recording process.
 * If microphone access is already granted and recording is paused, it resumes.
 * @returns {Promise<void>} A promise that resolves when recording successfully starts,
 * or rejects if microphone access is denied or an error occurs.
 */
async function startRecordingProcess() {
    // 1. Get Microphone Access (only if not already acquired)
    if (!audioStream) {
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone access granted.");
        } catch (err) {
            console.error("Error accessing microphone:", err);
            // Throwing an error allows the calling Alpine.js method to catch and handle it
            throw new Error("Microphone access denied or error: " + err.message);
        }
    }

    // 2. Initialize or Re-initialize MediaRecorder
    // This happens if mediaRecorder is null (first time) or if the audioStream somehow changed
    if (!mediaRecorder || mediaRecorder.stream !== audioStream) {
        // If an old mediaRecorder instance existed with a different stream, stop its tracks
        if (mediaRecorder && mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        mediaRecorder = new MediaRecorder(audioStream);
        
        // Set up the dataavailable event listener once per MediaRecorder instance
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        // The onstop handler will be set dynamically by stopRecordingProcess for promise resolution.
        // Avoid setting a generic onstop here if stopRecordingProcess relies on setting it specifically.
        console.log("MediaRecorder initialized/re-initialized with new stream.");
    } 
    // 3. Handle Recording State (resume if paused, warn if already recording)
    else if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        console.log("Recording resumed.");
        return; // Exit as recording is now active
    } else if (mediaRecorder.state === 'recording') {
        console.warn("MediaRecorder is already recording.");
        return; // Exit as recording is already active
    }

    // 4. Start Recording
    audioChunks = []; // Clear any previous audio chunks for a fresh recording
    mediaRecorder.start();
    console.log("Recording started.");
}

/**
 * Stops the current recording and returns the recorded audio as a Blob.
 * @returns {Promise<Blob>} A promise that resolves with the recorded audio Blob when recording stops.
 * Rejects if not currently recording or if an error occurs during stopping.
 */
async function stopRecordingProcess() {
    return new Promise((resolve, reject) => {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
            const errorMsg = "Not currently recording to stop.";
            console.warn(errorMsg);
            return reject(new Error(errorMsg));
        }

        // Set up the onstop handler specifically for this promise resolution
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // Default to WAV, consider 'audio/webm' for smaller files
            audioChunks = []; // Clear chunks for the next recording
            console.log("Recording stopped. Blob created.");
            resolve(audioBlob); // Resolve the promise with the audio Blob
            mediaRecorder.onstop = null; // Clear the handler after use to prevent stale closures
        };

        // Set up an onerror handler specifically for this promise
        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error during stop:", event.error);
            reject(event.error); // Reject the promise if an error occurs during stopping
            mediaRecorder.onerror = null; // Clear the handler
        };

        mediaRecorder.stop(); // This triggers the onstop/onerror event
    });
}

window.addEventListener('beforeunload', () => {
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        console.log("Microphone stream stopped on unload.");
    }
    // Also stop MediaRecorder if it's active (recording or paused)
    if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
        mediaRecorder.stop();
        console.log("MediaRecorder stopped on unload.");
    }
});