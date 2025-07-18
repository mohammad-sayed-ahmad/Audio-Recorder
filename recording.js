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
                console.debug('Stored Audio data');
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
    mediaRecorder.requestData();
    const objectStore = db.transaction(["audioStore"], "readwrite").objectStore('audioStore');
    objectStore.put({
        index: currentIndex,
        recording: []
    });
    mediaRecorder.ondataavailable = storeAudioData(currentIndex);
    mediaRecorder.requestData();
}

async function startRecording(currentIndex, isRecording) {
    if (!mediaRecorder){
        mediaRecorder = await setUpRecording();
    }
    mediaRecorder.start();
    isRecording = true;
    console.debug('MediaRecorder state:', mediaRecorder.state);
    startLineRecording(currentIndex);
}

function stopRecording(isRecording){
    mediaRecorder.stop();
    mediaRecorder.stream.getAudioTracks()[0].stop();
    mediaRecorder = null;
}

setUpDB();