const textArea = document.getElementById("importArea");
function changeText(text){
    textArea.value = text;
    textArea.dispatchEvent(new Event('input'));
}


async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    changeText(trimmedText);
    
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
    resetDB();
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

function resetDB(){
    const objectStore = db.transaction(["audioStore"], "readwrite").objectStore("audioStore");

    objectStore.clear();
}