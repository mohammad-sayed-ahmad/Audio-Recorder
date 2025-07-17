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
