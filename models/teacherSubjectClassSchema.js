const mongoose = require("mongoose");

const teacherSubjectClassSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'teacher',
        required: true,
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'subject',
        required: true,
    },
    sclass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sclass',
        required: true,
    },
    batch: {
        type: String,
        default: null, // For lab subjects, specifies which batch this teacher handles
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin',
        required: true,
    },
    // Optional: Add time slots or periods if needed
    schedule: {
        days: [String], // e.g., ['Monday', 'Wednesday', 'Friday']
        startTime: String, // e.g., '09:00'
        endTime: String, // e.g., '10:30'
    }
}, { timestamps: true });

// Compound index to ensure uniqueness per teacher (allows multiple teachers per subject)
teacherSubjectClassSchema.index({
    teacher: 1,
    subject: 1,
    sclass: 1,
    batch: 1
}, { unique: true });

// Virtual for display name
teacherSubjectClassSchema.virtual('displayName').get(function() {
    return `${this.subject.subName} (${this.subject.subCode}) - ${this.teacher.name}`;
});

module.exports = mongoose.model("TeacherSubjectClass", teacherSubjectClassSchema);