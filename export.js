// Assuming db is initialized elsewhere and accessible.
// Assuming JSZip is loaded.

async function getBlobWithDuration(data) {
    const blob = new Blob(data, { type: 'audio/wav' });
    const audio = new Audio();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => {
            const duration = audio.duration;
            URL.revokeObjectURL(url); // Clean up the object URL
            resolve({
                blob: blob,
                duration: duration * 1000 // Convert to milliseconds
            });
        });

        // Handle potential errors loading audio metadata
        audio.addEventListener('error', (e) => {
            console.error("Error loading audio metadata:", e);
            URL.revokeObjectURL(url); // Clean up in case of error too
            reject(new Error("Failed to load audio metadata."));
        });

        // Set the audio source to trigger loading metadata
        audio.src = url;
    });
}

function formatDuraion(durationMilliseconds) {
    const [HOUR_CONSTANT, MINUTE_CONSTANT, SECOND_CONSTANT] = [1000 * 60 * 60, 1000 * 60, 1000];

    const hours = Math.floor(durationMilliseconds / HOUR_CONSTANT);
    const hour_remainder = durationMilliseconds % HOUR_CONSTANT;
    const minutes = Math.floor(hour_remainder / MINUTE_CONSTANT);
    const minutes_remainder = hour_remainder % MINUTE_CONSTANT;
    const seconds = Math.floor(minutes_remainder / SECOND_CONSTANT);
    const seconds_remainder = minutes_remainder % SECOND_CONSTANT; // Milliseconds part

    // Pad seconds_remainder to 3 digits for milliseconds
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(seconds_remainder).padStart(3, '0')}`;
}

async function exportRecording(lines) {
    console.log('Exporting Recording');
    console.log("db:", db);

    if (!db) {
        console.error("❌ IndexedDB 'db' is not initialized.");
        return;
    }

    let zip = new JSZip();
    let fullRecording = [];
    let subtitle = 'WEBVTT\n\n';
    let startLength = 0;
    let index = 1;

    const audioPromises = []; // Array to hold all promises for audio processing

    // Create a new promise to wrap the cursor iteration
    // This allows us to await the entire cursor process
    await new Promise((resolve, reject) => {
        const tx = db.transaction('audioStore', 'readonly'); // Use 'readonly' for transactions that only read
        const store = tx.objectStore('audioStore');
        const cursorRequest = store.openCursor();

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const result = cursor.value;
                const lineText = lines[result.index]?.text ?? `[Missing line ${result.index}]`;
                console.log(`Processing line ${result.index}: ${lineText}`);

                // Push the promise returned by getBlobWithDuration into our array
                audioPromises.push(
                    getBlobWithDuration(result.recording)
                        .then(({ blob, duration }) => {
                            zip.file(`split/${result.index}-${lineText}.wav`, blob);
                            fullRecording = fullRecording.concat(Array.from(result.recording)); // Ensure proper concatenation of array-like
                            subtitle += `${index}\n${formatDuraion(startLength)} --> ${formatDuraion(startLength + duration)}\n${lineText}\n\n`;

                            index++;
                            startLength += duration;
                        })
                        .catch(error => {
                            console.error(`Error processing audio for line ${result.index}:`, error);
                            // Decide if you want to stop the whole process or just log the error and continue
                            // For now, we'll just log and let Promise.all handle any rejections.
                        })
                );
                cursor.continue(); // Move to the next item
            } else {
                // No more entries, resolve the cursor promise
                resolve();
            }
        };

        cursorRequest.onerror = (e) => {
            console.error("❌ Cursor failed:", e);
            reject(e); // Reject the cursor promise
        };

        // It's good practice to handle transaction completion/error as well
        tx.oncomplete = () => {
            console.log("IndexedDB transaction completed.");
            // The resolve() for the cursor happens in onsuccess, so no need here.
        };

        tx.onerror = (e) => {
            console.error("❌ IndexedDB transaction failed:", e);
            reject(e); // Reject the cursor promise if transaction fails
        };
    });

    // After the cursor has iterated through all items and collected all promises
    console.log("Waiting for all audio processing promises to resolve...");
    await Promise.all(audioPromises)
        .then(() => {
            console.log("All audio processing complete.");

            // Now that all individual audio files are processed, handle the full recording and subtitle
            // Assuming you want to create a single WAV file from fullRecording
            const fullRecordingBlob = new Blob(fullRecording, { type: 'audio/wav' });
            zip.file("full_recording.wav", fullRecordingBlob);
            zip.file("subtitles.vtt", subtitle);

            // Generate the zip file
            zip.generateAsync({ type: "blob" })
                .then(function (content) {
                    // content is the blob holding the zip file
                    console.log("Zip file generated successfully!");
                    // You can now download or use this blob
                    const downloadLink = document.createElement('a');
                    downloadLink.href = URL.createObjectURL(content);
                    downloadLink.download = 'recording_export.zip';
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(downloadLink.href); // Clean up
                })
                .catch(error => {
                    console.error("❌ Error generating zip file:", error);
                });
        })
        .catch(error => {
            console.error("❌ One or more audio processing promises rejected:", error);
            // Handle overall failure if any audio processing failed
        });

    console.log("Exporting Recording function finished execution (asynchronously).");
    resetDB();
}