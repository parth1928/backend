// Get all D2D students for a specific admin and/or class
exports.getAllDtodStudents = async (req, res) => {
    try {
        const { adminId, classId } = req.query;
        let filter = {};
        if (adminId) filter.school = adminId;
        if (classId) filter.sclassName = classId;
        console.log('D2D fetch filter:', filter); // Debug log
        const students = await DtodStudent.find(filter).populate({
            path: 'sclassName',
            select: 'sclassName school',
            populate: { path: 'school', select: 'schoolName' }
        });
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
        // Use sclassName and school from form data (selected in UI)
        const sclassName = req.body.sclassName;
        const school = req.body.school;
        if (!sclassName || !school) {
            return res.status(400).json({ success: false, message: 'No class or admin selected' });
        }
        const dtodStudents = students.map(s => ({
            name: s.name,
            rollNum: s.rollNum,
            email: s.email,
            sclassName: sclassName,
            school: school
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
        // Only allow fetching if the student belongs to the current admin
        const adminId = req.query.adminId;
        const student = await DtodStudent.findOne({ _id: req.params.id, ...(adminId ? { school: adminId } : {}) })
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
