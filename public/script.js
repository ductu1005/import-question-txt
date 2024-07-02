async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const questionTypeSelect = document.getElementById('questionType');
    const file = fileInput.files[0];
    const questionType = questionTypeSelect.value;

    if (!file) {
        alert('Please select a file first!');
        return;
    }

    if (questionType === "0") {
        alert('Please select a question type!');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('questionType', questionType);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to generate XML.');
        }

        const jsonResponse = await response.json();
        const downloadLink = document.createElement('a');
        downloadLink.href = jsonResponse.filePath;
        downloadLink.download = 'output.zip';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred. Please try again.');
    }
}
