async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    document.getElementById("importArea").textContent = trimmedText;
}
document.getElementById("importFile").addEventListener("input", modifyImportArea)

function generateLines(text) {
    var newLines = [];
    for (const [index, line] of text.split('\n').entries()){
        newLines.push({
            text: line,
            recording: null,
            shown: index == 0
        })
    }
}

