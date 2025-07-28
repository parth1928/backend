const mongoose = require('mongoose');


const dtodStudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rollNum: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    sclassName: { type: mongoose.Schema.Types.ObjectId, ref: 'sclass' },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'admin', required: true },
    createdAt: { type: Date, default: Date.now },
    attendance: [{
        date: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            enum: ['Present', 'Absent'],
            required: true
        },
        subName: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'subject',
            required: true
        }
    }]
});

dtodStudentSchema.index({ sclassName: 1 });
dtodStudentSchema.index({ rollNum: 1 });
dtodStudentSchema.index({ 'attendance.subName': 1 });
module.exports = mongoose.model('dtod_students', dtodStudentSchema);
