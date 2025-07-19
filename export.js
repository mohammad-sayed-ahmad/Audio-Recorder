async function getBlobWithDuration(data){
    const blob = new Blob(data, {type: 'audio/wav'});
    const audio = new Audio();
    const url = URL.createObjectURL(blob);

    return new Promise(async function (resolve, reject) {
        audio.addEventListener('loadedmetadata', (event) => {
            const duration = audio.duration;
            URL.revokeObjectURL(url);
            resolve({
                blob: blob,
                duration: duration * 1000
            });
        })
    })
}

function formatDuraion(durationMilliseconds){
    const [HOUR_CONSTANT, MINUTE_CONSTANT, SECOND_CONSTANT] = [1000*60*60, 1000*60, 1000];

    const hours = Math.floor(durationMilliseconds / HOUR_CONSTANT);
    const hour_remainder = durationMilliseconds % HOUR_CONSTANT;
    const minutes = Math.floor(hour_remainder / MINUTE_CONSTANT);
    const minutes_remainder = hour_remainder % MINUTE_CONSTANT;
    const seconds = Math.floor(minutes_remainder / SECOND_CONSTANT);
    const seconds_remainder = minutes_remainder % SECOND_CONSTANT;

    return `${String(hours).padStart(2 , '0')}:${String(minutes).padStart(2 , '0')}:${String(seconds).padStart(2 , '0')},${String(seconds_remainder).padStart(3 , '0')}`
}

async function exportRecording(lines) {
    console.log('Exporting Recording');
    console.log("db:", db);


    if (!db) {
        console.error("❌ IndexedDB 'db' is not initialized.");
        return;
    }

    const tx = db.transaction('audioStore');
    const store = tx.objectStore('audioStore');

    let zip = new JSZip();
    let fullRecording = [];
    let subtitle = 'WEBVTT\n\n';
    let startLength = 0;
    let index = 1;

    return new Promise((resolve, reject) => {
        const request = store.openCursor();

        request.onsuccess = async function handler(event) {
            const cursor = event.target.result;
            if (!cursor) {
                console.log("✅ Done looping through store.");
                console.log(subtitle);
                resolve(); // Finalize or save zip here if needed
                return;
            }

            const result = cursor.value;
            const lineText = lines[result.index]?.text ?? `[Missing line ${result.index}]`;

            try {
                const { blob, duration } = await getBlobWithDuration(result.recording);
                zip.file(`split/${result.index}-${lineText}.wav`, blob);

                fullRecording = fullRecording.concat(result.recording);
                subtitle += `${index}\n${formatDuraion(startLength)} --> ${formatDuraion(startLength + duration)}\n${lineText}\n\n`;

                index++;
                startLength += duration;

                cursor.continue(); // loop to next
            } catch (err) {
                reject(err);
            }
        };

        request.onerror = (e) => {
            console.error("❌ Cursor failed:", e);
            reject(e);
        };
    });
}
