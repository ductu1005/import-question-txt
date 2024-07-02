const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { Readable } = require('stream');

const app = express();
const PORT = 3002;

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
const templateDir = path.join(__dirname, 'template_txt');

app.get('/api/sample/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(templateDir, fileName);
    res.download(filePath, fileName, (err) => {
        if (err) {
            res.status(404).send('File not found.');
        }
    });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        const data = fs.readFileSync(req.file.path, 'utf8');
        const questionType = req.body.questionType;
        const questions = parseQuestions(data);
        const xmlContent = createXML(questions, questionType);

        res.attachment('output.zip');
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('error', (err) => {
            res.status(500).send({ error: err.message });
        });

        archive.pipe(res);
        const xmlStream = Readable.from([xmlContent]);
        archive.append(xmlStream, { name: 'output.xml' });

        archive.finalize();

    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error processing file.');
    }
});

function parseQuestions(data) {
    const questions = [];
    const blocks = data.split(/\n(?=^\d+\s)/gm);

    blocks.forEach(block => {
        const lines = block.trim().split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return; // Có ít nhất một câu hỏi và một câu trả lời

        const questionLine = lines[0].trim();
        const options = lines.slice(1, lines.length - 1).map(line => line.trim().replace(/^[A-Z]\)\s*/, ''));
        const answerLine = lines[lines.length - 1].trim();

        const question = questionLine.trim().replace(/:$/, '');

        const answerMatch = answerLine.match(/^ANSWER:\s*(.+)\s*$/);
        const answer = answerMatch ? answerMatch[1] : '';

        questions.push({
            question,
            options,
            answer
        });
    });

    console.log("---: ", questions);
    return questions;
}

function createXML(questions, questionType) {
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">\n`;
    xmlContent += `<section ident="root_section">\n`;

    switch (parseInt(questionType)) {
        case 1:
            xmlContent = generateMultipleChoiceQuestions(questions, xmlContent);
            break;
        case 2:
            xmlContent = generateMultipleAnswersQuestions(questions, xmlContent);
            break;
        case 3:
            xmlContent = generateTrueFalseQuestions(questions, xmlContent);
            break;
        default:
            console.error('Unknown question type.');
    }

    xmlContent += `</section>\n</questestinterop>`;
    return xmlContent;
}

function generateMultipleChoiceQuestions(questions, xmlContent) {
    questions.forEach((q, index) => {
        const itemId = `multiple_choice_question_${index + 1}`;
        xmlContent += generateQuestionItem(itemId, `Câu ${index + 1}`, 'multiple_choice_question', q.question);
        xmlContent += generateResponseLid('response1', 'Single', generateRenderChoice(q.options));
        xmlContent += generateResprocessingForSingleResponse(q.answer);
        xmlContent += `</item>\n`;
    });
    return xmlContent;
}

function generateMultipleAnswersQuestions(questions, xmlContent) {
    questions.forEach((q, index) => {
        const itemId = `multiple_answers_question_${index + 1}`;
        xmlContent += generateQuestionItem(itemId, `Câu ${index + 1}`, 'multiple_answers_question', q.question);
        xmlContent += generateResponseLid('response1', 'Multiple', generateRenderChoice(q.options));
        xmlContent += generateResprocessingForMultipleResponse(q.options, q.answer);
        xmlContent += `</item>\n`;
    });
    return xmlContent;
}

function generateTrueFalseQuestions(questions, xmlContent) {
    questions.forEach((q, index) => {
        const itemId = `true_false_question_${index + 1}`;
        xmlContent += generateQuestionItem(itemId, `Câu ${index + 1}`, 'true_false_question', q.question);
        xmlContent += generateResponseLid('response1', 'Single', generateRenderChoice(['True', 'False']));
        xmlContent += generateResprocessingForSingleResponse(q.answer);
        xmlContent += `</item>\n`;
    });
    return xmlContent;
}

function generateQuestionItem(itemId, title, questionType, questionText) {
    let itemXML = `<item ident="${itemId}" title="${title}">\n`;
    itemXML += `<itemmetadata>\n<qtimetadata>\n<qtimetadatafield>\n<fieldlabel>question_type</fieldlabel>\n<fieldentry>${questionType}</fieldentry>\n</qtimetadatafield>\n<qtimetadatafield>\n<fieldlabel>points_possible</fieldlabel>\n<fieldentry>1.0</fieldentry>\n</qtimetadatafield>\n</qtimetadata>\n</itemmetadata>\n`;
    itemXML += `<presentation>\n<material>\n<mattext texttype="text/html">${questionText}</mattext>\n</material>\n`;
    return itemXML;
}

function generateResponseLid(ident, rcardinality, renderChoiceXML) {
    let responseLidXML = `<response_lid ident="${ident}" rcardinality="${rcardinality}">\n${renderChoiceXML}</response_lid>\n</presentation>\n`;
    return responseLidXML;
}

function generateRenderChoice(options) {
    let renderChoiceXML = `<render_choice>\n`;
    options.forEach((option, optIndex) => {
        const optId = String.fromCharCode(65 + optIndex);
        renderChoiceXML += `<response_label ident="${optId}">\n<material>\n<mattext texttype="text/plain">${option}</mattext>\n</material>\n</response_label>\n`;
    });
    renderChoiceXML += `</render_choice>\n`;
    return renderChoiceXML;
}

function generateResprocessingForSingleResponse(answer) {
    let resprocessingXML = `<resprocessing>\n<outcomes>\n<decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>\n</outcomes>\n<respcondition continue="No">\n<conditionvar>\n<varequal respident="response1">${answer}</varequal>\n</conditionvar>\n<setvar action="Set" varname="SCORE">100</setvar>\n</respcondition>\n</resprocessing>\n`;
    return resprocessingXML;
}

function generateResprocessingForMultipleResponse(options, answer) {
    let resprocessingXML = `<resprocessing>\n<outcomes>\n<decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>\n</outcomes>\n<respcondition continue="No">\n<conditionvar>\n<and>\n`;
    options.forEach((_, optIndex) => {
        const optId = String.fromCharCode(65 + optIndex);
        if (answer.includes(optId)) {
            resprocessingXML += `<varequal respident="response1">${optId}</varequal>\n`;
        } else {
            resprocessingXML += `<not>\n<varequal respident="response1">${optId}</varequal>\n</not>\n`;
        }
    });
    resprocessingXML += `</and>\n</conditionvar>\n<setvar action="Set" varname="SCORE">100</setvar>\n</respcondition>\n</resprocessing>\n`;
    return resprocessingXML;
}



app.listen(PORT, () => {
    console.log(`Server is running on http://10.10.0.128:${PORT}`);
});
