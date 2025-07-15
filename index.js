async function modifyImportArea(event) {
    const importFileText = await event.target.files[0].text();
    const trimmedText = importFileText.trim();
    
    document.getElementById("importArea").textContent = trimmedText;
}

function generateLines(text) {
    return text.split('\n').map((x) => {
        return {"text": x, "recording": undefined};
    });
}

document.getElementById("importFile").addEventListener("input", modifyImportArea)