let mediaRecorder;
let db;

function setUpRecording() {
    return new Promise((resolve, reject) => {

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({audio: true})
        .then((stream) => {
            const recorder = new MediaRecorder(stream);
            recorder.onerror = () => {
                console.error("Issue with recording.");
            }
            console.debug('MediaRecorder created:', recorder);
            resolve(recorder);
        })
        .catch((err) => {
            console.error(`The following getUserMedia error occurred: ${err}`);
            reject(err);
        });
    } else {
        reject(new Error("getUserMedia not supported"));
    }

    });
}

function setUpDB() {
    var request = indexedDB.open("AudioDB", 2);
    request.onsuccess =
    (event) => {
        db = event.target.result;
    }

    request.onupgradeneeded = 
    (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('audioStore')) {
            db.createObjectStore('audioStore', {keyPath: "index"});
            console.debug("Created audioStore");
        }
    }

    request.onerror = 
    (event) => {
        console.error("Issue with AudioDB");
    }

}

function storeAudioData(currentIndex){
    return (event) => {
        const transaction = db.transaction(["audioStore"], "readwrite");
        const objectStore = transaction.objectStore('audioStore');

        const getRequest = objectStore.get(currentIndex);
        getRequest.onsuccess = (e) => {
            const data = e.target.result;
            if (data) {
                console.debug(`Stored Audio data with index ${currentIndex}`);
                data.recording.push(event.data); // Push new blob to existing array
                objectStore.put(data); // Put the updated data back
            } else {
                // This case handles if the initial put in startLineRecording somehow failed or was too slow
                // Or if data for currentIndex doesn't exist yet, which shouldn't happen if startLineRecording ran.
                console.warn(`No existing record found for index ${currentIndex}. Creating new entry.`);
                objectStore.put({
                    index: currentIndex,
                    recording: [event.data]
                });
            }
        };

    }
}

function startLineRecording(currentIndex){
    const objectStore = db.transaction(["audioStore"], "readwrite").objectStore('audioStore');
    objectStore.put({
        index: currentIndex,
        recording: []
    });
    mediaRecorder.ondataavailable = storeAudioData(currentIndex);
    
}

async function startRecording(currentIndex, alpineData) {
    if (!mediaRecorder){
        mediaRecorder = await setUpRecording();
    }
    mediaRecorder.start();
    alpineData.isRecording = true;
    console.debug('MediaRecorder state:', mediaRecorder.state);
    startLineRecording(currentIndex);
}

async function stopRecording(alpineData, final = true){
    if (mediaRecorder && mediaRecorder.state === "recording") {
        return new Promise(async (resolve) => { // Return a promise for stopping
            const originalOnDataAvailableHandler = mediaRecorder.ondataavailable; // Get the currently assigned handler
            let ondataavailableHandled = false;

            // Temporarily replace ondataavailable to handle the final blob and resolve
            mediaRecorder.ondataavailable = async (event) => {
                if (!ondataavailableHandled) { // Ensure it only runs once for the final blob
                    ondataavailableHandled = true;
                    // Call the original handler to process the data
                    if (originalOnDataAvailableHandler) {
                        await originalOnDataAvailableHandler(event); // Wait for its IndexedDB put to finish
                    }
                    resolve(); // Resolve the promise once the final data is stored
                }
            };

            mediaRecorder.stop(); // This triggers the final ondataavailable
            console.log("Recording stopped. Waiting for final data to store.");

            // Add a timeout just in case ondataavailable doesn't fire or fails to resolve
            setTimeout(() => {
                if (!ondataavailableHandled) {
                    console.warn("Timed out waiting for final ondataavailable event during stop.");
                    resolve(); // Resolve even if timeout occurs
                }
            }, 2000); // 2 second timeout
        }).then(() => {
            alpineData.lines[alpineData.currentIndex].completed = true; 
            if (final){
                // This part runs AFTER the promise from the new ondataavailable handler resolves
                if (mediaRecorder && mediaRecorder.stream) {
                    mediaRecorder.stream.getTracks().forEach(track => track.stop());
                    console.log("Stream tracks released.");
                }
                mediaRecorder = null; // Clear the recorder
                alpineData.isRecording = false; // Update Alpine.js state
            }
        });
    } else {
        alpineData.isRecording = false; // Ensure state is false even if not recording
        return Promise.resolve(); // Return a resolved promise if nothing to stop
    }
}


async function moveToNextLineRecording(alpineData){
    await stopRecording(alpineData, false);

    alpineData.currentIndex++;
    startRecording(alpineData.currentIndex, alpineData);
}

// Replace your existing getRecordingURL function with this:
async function getRecordingURL(index) {
    // Wait for DB to be initialized if it's not ready yet
    while (!db) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms and check again
    }

    const transaction = db.transaction(["audioStore"], "readonly");
    const objectStore = transaction.objectStore('audioStore');

    return new Promise((resolve, reject) => {
        const getRequest = objectStore.get(index);

        getRequest.onsuccess = (event) => {
            const data = event.target.result;
            console.debug(`Looking for recording at index ${index}:`, data); // Debug log
            
            if (data && data.recording && data.recording.length > 0) {
                console.debug(`Found recording with ${data.recording.length} chunks for index ${index}`);
                const recordingBlob = new Blob(data.recording, { type: 'audio/webm' });
                resolve(URL.createObjectURL(recordingBlob));
            } else {
                console.warn(`No recording data found for index ${index}. Data structure:`, data);
                resolve(''); // Resolve with empty string if no data
            }
        };

        getRequest.onerror = (event) => {
            console.error("Error retrieving recording from IndexedDB:", event.target.error);
            reject(''); // Reject the promise on error
        };
    });
}



setUpDB();