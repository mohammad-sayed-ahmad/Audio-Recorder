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
            completed: false
        })
    }
    return newLines;
}

function moveToNextLine(alpineData){
    if (alpineData.currentIndex >= (alpineData.lines.length - 1)){
        alpineData.stage = 'export';
    } else {
        alpineData.currentIndex++;
    }
}

function isLast(alpineData){
    return (alpineData.lines.length - 1) == alpineData.currentIndex
}