let mediaRecorder;
let db;

function setUpRecording() {
    return new Promise((resolve, reject) => {

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({audio: true})
        .then((stream) => {
            const recorder = new MediaRecorder(stream);
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
            console.info("Created audioStore");
        }
    }

}

function storeAudioData(transaction, currentIndex){
    return (event) => {
        var array = transaction.get(currentIndex).recording;
        console.log('Stored Audio data');
        array.push(event.data);
        transaction.put({
            index: currentIndex,
            recording: array
        })
    }
}

function startLineRecording(currentIndex){
    const transaction = db.transaction(["audioStore"], "readwrite").objectStore('audioStore');
    transaction.put({
        index: currentIndex,
        recording: []
    });
    mediaRecorder.ondataavailable = storeAudioData(transaction, currentIndex);
}

async function startRecording(currentIndex) {
    if (!mediaRecorder){
        mediaRecorder = await setUpRecording();
    }
    console.log(mediaRecorder);
    startLineRecording(currentIndex);
    mediaRecorder.start();
}

function stopRecording(){
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorder.stop();
}

setUpDB();