// Get all D2D students for a specific admin (school) and/or class
exports.getAllDtodStudents = async (req, res) => {
    try {
        // Accept adminId (school) and/or classId as query params
        const { adminId, classId } = req.query;
        let filter = {};
        if (classId) {
            filter.sclassName = classId;
        }
        // If adminId is provided, filter by sclassName.school
        let studentsQuery = DtodStudent.find(filter).populate({
            path: 'sclassName',
            select: 'sclassName school',
            populate: { path: 'school', select: 'schoolName' }
        });
        let students = await studentsQuery;
        // If adminId is provided, filter students by sclassName.school
        if (adminId) {
            students = students.filter(s => s.sclassName && s.sclassName.school && s.sclassName.school._id.toString() === adminId);
        }
        res.json(students);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
const DtodStudent = require('../models/dtodStudentSchema');
const Sclass = require('../models/sclassSchema');
const Admin = require('../models/adminSchema');
const csv = require('csvtojson');

// Bulk upload D2D students from CSV
exports.bulkUploadDtodStudents = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const students = await csv().fromString(req.file.buffer.toString());
        // Use sclassName from form data (selected in UI)
        const sclassName = req.body.sclassName;
        if (!sclassName) {
            return res.status(400).json({ success: false, message: 'No class selected' });
        }
        const dtodStudents = students.map(s => ({
            name: s.name,
            rollNum: s.rollNum,
            email: s.email,
            sclassName: sclassName,
        }));
        await DtodStudent.insertMany(dtodStudents, { ordered: false });
        res.json({ success: true, message: 'D2D students uploaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete D2D student by ID
exports.deleteDtodStudent = async (req, res) => {
    try {
        const result = await DtodStudent.findByIdAndDelete(req.params.id);
        if (result) {
            res.json({ success: true, message: 'D2D student deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'D2D student not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get D2D student detail by ID
exports.getDtodStudentDetail = async (req, res) => {
    try {
        const student = await DtodStudent.findById(req.params.id)
            .populate("sclassName", "sclassName")
            .populate("school", "schoolName");
        if (student) {
            res.json(student);
        } else {
            res.status(404).json({ message: "No D2D student found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
