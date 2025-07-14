const importArea = document.getElementById("importArea");

async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    importArea.textContent = trimmedText;
}

function moveToRecord(event){
    document.getElementById("recordLink").click();
}

document.getElementById("importFile").addEventListener("input", modifyImportArea)
document.getElementById("importNext").addEventListener("click", moveToRecord);