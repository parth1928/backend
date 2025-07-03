const Subject = require('../models/subjectSchema.js');

// Update batches for a subject
const updateSubjectBatches = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { batches } = req.body; // [{ batchName, students: [studentId, ...] }]
        const subject = await Subject.findById(subjectId);
        if (!subject) return res.status(404).json({ message: 'Subject not found' });
        subject.batches = batches;
        await subject.save();
        res.json({ message: 'Batches updated successfully', batches });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Error updating batches', error: err });
    }
};

module.exports = { updateSubjectBatches };
