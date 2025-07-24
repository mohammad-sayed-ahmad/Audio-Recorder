// Assuming db is initialized elsewhere and accessible.
// Assuming JSZip is loaded.

async function getBlobWithDuration(data, audioContext) {
    // Create a Blob from the raw data. Assuming 'data' can be directly used by Blob constructor.
    // If 'data' is already a Blob, this step is redundant but harmless.
    const blob = new Blob(data, { type: 'audio/wav' });

    try {
        // Read the Blob into an ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();
        // Decode the ArrayBuffer into an AudioBuffer using AudioContext
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        // Get the duration from the AudioBuffer (in seconds)
        const duration = audioBuffer.duration;

        // Validate duration to avoid NaN/Infinity
        if (isNaN(duration) || !isFinite(duration) || duration <= 0) {
            console.warn("Could not get a valid duration for audio blob using AudioContext. Duration:", duration, "Blob size:", blob.size);
            // Return 0 duration if invalid, allowing the process to continue
            return { blob: blob, duration: 0 };
        }

        // Return the original blob and duration in milliseconds
        return {
            blob: blob,
            duration: duration * 1000
        };
    } catch (error) {
        console.error("Error decoding audio data with AudioContext:", error, "Blob size:", blob.size);
        // If decoding fails (e.g., malformed WAV), return 0 duration and log the error.
        return { blob: blob, duration: 0 };
    }
}

/**
 * Formats a duration in milliseconds into a WEBVTT compatible time string (HH:MM:SS,mmm).
 *
 * @param {number} durationMilliseconds - The duration in milliseconds.
 * @returns {string} The formatted duration string.
 */
function formatDuraion(durationMilliseconds) {
    const [HOUR_CONSTANT, MINUTE_CONSTANT, SECOND_CONSTANT] = [1000 * 60 * 60, 1000 * 60, 1000];

    const hours = Math.floor(durationMilliseconds / HOUR_CONSTANT);
    const hour_remainder = durationMilliseconds % HOUR_CONSTANT;
    const minutes = Math.floor(hour_remainder / MINUTE_CONSTANT);
    const minutes_remainder = hour_remainder % MINUTE_CONSTANT;
    const seconds = Math.floor(minutes_remainder / SECOND_CONSTANT);
    const milliseconds = Math.floor(minutes_remainder % SECOND_CONSTANT); // Milliseconds part

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Helper function to write a string to a DataView.
 * @param {DataView} view - The DataView to write to.
 * @param {number} offset - The offset in the DataView.
 * @param {string} string - The string to write.
 */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Generates a WAV Blob from an AudioBuffer.
 * This is a simplified WAV encoder. For production, consider using a dedicated library like 'audiobuffer-to-wav'.
 *
 * @param {AudioBuffer} audioBuffer - The AudioBuffer containing the PCM audio data.
 * @returns {Blob} A Blob representing the WAV audio file.
 */
function generateWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;
    const bytesPerSample = 2; // Assuming 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = totalSamples * blockAlign;
    const fileSize = 36 + dataSize; // 36 is fixed header size without data chunk

    // Create a new ArrayBuffer for the WAV file
    const buffer = new ArrayBuffer(fileSize + 8); // +8 for 'RIFF' and filesize
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true); // True for little-endian
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // Bits per sample (16)

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data from AudioBuffer
    let offset = 44;
    for (let i = 0; i < totalSamples; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            let sample = audioBuffer.getChannelData(channel)[i];
            // Clamp sample to -1 to 1 and convert to 16-bit integer
            sample = Math.max(-1, Math.min(1, sample));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // Convert to 16-bit
            view.setInt16(offset, sample, true); // Write as 16-bit signed integer
            offset += bytesPerSample;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}


/**
 * Exports audio recordings from IndexedDB, generates a subtitle file,
 * concatenates all recordings into a single WAV, and zips them all.
 *
 * @param {Array<{text: string}>} lines - An array of objects, each with a 'text' property
 * corresponding to the subtitle line.
 */
async function exportRecording(lines) {
    console.log('Exporting Recording');
    console.log("db:", db); // Check if db is initialized

    if (!db) {
        console.error("❌ IndexedDB 'db' is not initialized. Please ensure Firebase/IndexedDB setup is complete.");
        // Display a user-friendly message instead of just console error in a real app
        // For example, update a UI element to show an error message.
        return;
    }

    let zip = new JSZip();
    let subtitle = '';
    let startLength = 0;
    let index = 1;

    const audioSegmentsPromises = []; // Will store promises that resolve to { blob, duration, lineText, index }
    const audioContext = new (window.AudioContext || window.webkitAudioContext)(); // Initialize AudioContext

    // Use a Promise to wrap the IndexedDB cursor iteration,
    // ensuring all data is collected before proceeding.
    await new Promise((resolve, reject) => {
        const tx = db.transaction('audioStore', 'readonly'); // Use 'readonly' for reading
        const store = tx.objectStore('audioStore');
        const cursorRequest = store.openCursor();

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const result = cursor.value;
                const lineText = lines[result.index]?.text ?? `[Missing line ${result.index}]`;
                console.log(`Processing line ${result.index}: ${lineText}`);

                // Call the improved getBlobWithDuration with audioContext
                audioSegmentsPromises.push(
                    getBlobWithDuration(result.recording, audioContext)
                        .then(({ blob, duration }) => {
                            // Return an object containing all necessary data for later processing
                            return { blob, duration, lineText, index: result.index, originalRecordingData: result.recording };
                        })
                        .catch(error => {
                            console.error(`Error processing audio for line ${result.index}:`, error);
                            return null; // Return null for failed segments to be filtered out
                        })
                );
                cursor.continue(); // Move to the next item in the store
            } else {
                resolve(); // No more entries, resolve the outer promise
            }
        };

        cursorRequest.onerror = (e) => {
            console.error("❌ Cursor failed:", e);
            reject(e); // Reject the outer promise if cursor fails
        };

        // Handle transaction completion/error
        tx.oncomplete = () => {
            console.log("IndexedDB transaction completed.");
        };

        tx.onerror = (e) => {
            console.error("❌ IndexedDB transaction failed:", e);
            reject(e); // Reject the outer promise if transaction fails
        };
    });

    // Wait for all individual audio segments to be processed by getBlobWithDuration
    console.log("Waiting for all individual audio segment promises to resolve...");
    // Filter out any segments that failed to process (returned null)
     console.log("Waiting for all individual audio segment promises to resolve...");
    const processedSegments = (await Promise.all(audioSegmentsPromises)).filter(Boolean);

    const audioBuffersToConcatenate = [];

    // Now, iterate through the successfully processed segments
    for (const segment of processedSegments) {
        // We get the original recording data, not a pre-made blob
        const { duration, lineText, index: segmentIndex, originalRecordingData } = segment;

        // Decode the original recording data into an AudioBuffer
        let audioBuffer;
        try {
            // Use the original data which is in a container format like mp4
            const segmentBlobForDecoding = new Blob(originalRecordingData);
            const arrayBuffer = await segmentBlobForDecoding.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffersToConcatenate.push(audioBuffer);
        } catch (e) {
            console.error(`Error decoding audio blob for WAV conversion (line ${segmentIndex}):`, e);
            continue; // Skip this file if it can't be decoded
        }

        // Generate a proper WAV Blob from the AudioBuffer
        const wavBlob = generateWavBlob(audioBuffer); // Use your existing function!

        // Add the new WAV file to the zip
        zip.file(`split/${segmentIndex}-${lineText}.wav`, wavBlob);

        // Update subtitle content
        subtitle += `${index}\n${formatDuraion(startLength)} --> ${formatDuraion(startLength + duration)}\n${lineText}\n\n`;

        index++;
        startLength += duration;
    }


    // --- Concatenate all AudioBuffers into a single AudioBuffer for the full recording ---
    let fullRecordingBlob = null;
    if (audioBuffersToConcatenate.length > 0) {
        // Ensure all audio buffers have the same sample rate and number of channels
        const firstBuffer = audioBuffersToConcatenate[0];
        const sampleRate = firstBuffer.sampleRate;
        const numberOfChannels = firstBuffer.numberOfChannels;

        // Calculate total length of the concatenated audio
        const totalLength = audioBuffersToConcatenate.reduce((sum, buffer) => {
            if (buffer.sampleRate !== sampleRate || buffer.numberOfChannels !== numberOfChannels) {
                console.warn("Mismatched audio buffer properties. Skipping for concatenation:", buffer);
                return sum; // Skip if properties don't match
            }
            return sum + buffer.length;
        }, 0);

        // Create a new empty AudioBuffer for the concatenated data
        const fullAudioBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

        // Copy audio data from each segment into the fullAudioBuffer
        let offset = 0;
        for (const buffer of audioBuffersToConcatenate) {
            if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === numberOfChannels) {
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    fullAudioBuffer.copyToChannel(buffer.getChannelData(channel), channel, offset);
                }
                offset += buffer.length;
            }
        }

        // Encode the full AudioBuffer back into a WAV Blob
        try {
            fullRecordingBlob = generateWavBlob(fullAudioBuffer);
            zip.file("full_recording.wav", fullRecordingBlob);
        } catch (e) {
            console.error("❌ Error generating full WAV blob:", e);
        }
    } else {
        console.warn("No valid audio segments to concatenate for full recording.");
    }

    // Add the subtitle file to the zip
    zip.file("subtitles.srt", subtitle);

    // Generate the final zip file
    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            console.log("Zip file generated successfully!");
            // Create a download link for the user
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(content);
            downloadLink.download = 'recording_export.zip';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadLink.href); // Clean up the object URL
        })
        .catch(error => {
            console.error("❌ Error generating zip file:", error);
            // Display an error message to the user
        })
        .finally(() => {
            // Close the audio context when all audio processing is complete
            audioContext.close();
            console.log("AudioContext closed.");
        });

    console.log("Exporting Recording function finished execution (asynchronously).");
}