const importArea = document.getElementById("importArea");

async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    importArea.textContent = trimmedText;
}

document.getElementById("importFile").addEventListener("input", modifyImportArea)