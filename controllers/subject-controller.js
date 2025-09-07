const Subject = require('../models/subjectSchema.js');
const Teacher = require('../models/teacherSchema.js');
const Student = require('../models/studentSchema.js');

const subjectCreate = async (req, res) => {
    try {
        const subjects = req.body.subjects.map((subject) => ({
            subName: subject.subName,
            subCode: subject.subCode,
            sessions: subject.sessions,
            isLab: subject.isLab || false,
            batches: subject.batches || [],
        }));

        const existingSubjectBySubCode = await Subject.findOne({
            'subjects.subCode': subjects[0].subCode,
            school: req.body.adminID,
        });

        if (existingSubjectBySubCode) {
            res.send({ message: 'Sorry this subcode must be unique as it already exists' });
        } else {
            const newSubjects = subjects.map((subject) => ({
                ...subject,
                sclassName: req.body.sclassName,
                school: req.body.adminID,
            }));

            const result = await Subject.insertMany(newSubjects);
            res.send(result);
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

const allSubjects = async (req, res) => {
    try {
        let subjects = await Subject.find({ school: req.params.id })
            .populate("sclassName", "sclassName")
        if (subjects.length > 0) {
            res.send(subjects)
        } else {
            res.send({ message: "No subjects found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

// Get subjects assigned to a specific teacher
const teacherSubjects = async (req, res) => {
    try {
        const teacherId = req.params.id;
        
        // Find the teacher to get their assigned subject IDs
        const teacher = await Teacher.findById(teacherId);
        
        if (!teacher || !teacher.teachSubjects || teacher.teachSubjects.length === 0) {
            return res.send({ message: "No subjects assigned to this teacher" });
        }
        
        // Get the full subject details
        const subjects = await Subject.find({ 
            _id: { $in: teacher.teachSubjects } 
        }).populate("sclassName", "sclassName");
        
        if (subjects.length > 0) {
            res.send(subjects);
        } else {
            res.send({ message: "No subjects found" });
        }
    } catch (err) {
        console.error("Error fetching teacher subjects:", err);
        res.status(500).json(err);
    }
};

const classSubjects = async (req, res) => {
    try {
        let subjects = await Subject.find({ sclassName: req.params.id })
        if (subjects.length > 0) {
            res.send(subjects)
        } else {
            res.send({ message: "No subjects found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

const freeSubjectList = async (req, res) => {
    try {
        let subjects = await Subject.find({ 
            sclassName: req.params.id,
            $or: [
                { teachers: { $exists: false } },
                { teachers: { $size: 0 } }
            ]
        });
        if (subjects.length > 0) {
            res.send(subjects);
        } else {
            res.send({ message: "No subjects found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

const getSubjectDetail = async (req, res) => {
    try {
        let subject = await Subject.findById(req.params.id);
        if (subject) {
            subject = await subject.populate("sclassName", "sclassName")
            subject = await subject.populate("teachers", "name")
            res.send(subject);
        }
        else {
            res.send({ message: "No subject found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
}

const deleteSubject = async (req, res) => {
    try {
        const subjectId = req.params.id;
        console.log('Deleting subject with ID:', subjectId);
        
        const deletedSubject = await Subject.findByIdAndDelete(subjectId);
        
        if (!deletedSubject) {
            return res.status(404).json({ message: "Subject not found" });
        }
        
        console.log('Subject found and deleted:', deletedSubject);

        // Update teachers who have this subject assigned
        const updateTeacherResult = await Teacher.updateMany(
            { teachSubjects: subjectId },
            { $pull: { teachSubjects: subjectId } }
        );
        
        console.log('Updated teachers result:', updateTeacherResult);

        // Remove the objects containing the deleted subject from students' examResult array
        const updateStudentExamResult = await Student.updateMany(
            { 'examResult.subName': subjectId },
            { $pull: { examResult: { subName: subjectId } } }
        );
        
        console.log('Updated student exam results:', updateStudentExamResult);

        // Remove the objects containing the deleted subject from students' attendance array
        const updateStudentAttendance = await Student.updateMany(
            { 'attendance.subName': subjectId },
            { $pull: { attendance: { subName: subjectId } } }
        );
        
        console.log('Updated student attendance:', updateStudentAttendance);

        res.status(200).json(deletedSubject);
    } catch (error) {
        console.error('Error deleting subject:', error);
        res.status(500).json({ message: 'Error deleting subject', error: error.message });
    }
};

const deleteSubjects = async (req, res) => {
    try {
        const deletedSubjects = await Subject.deleteMany({ school: req.params.id });

        // Set the teachSubject field to null in teachers
        await Teacher.updateMany(
            { teachSubject: { $in: deletedSubjects.map(subject => subject._id) } },
            { $unset: { teachSubject: "" }, $unset: { teachSubject: null } }
        );

        // Set examResult and attendance to null in all students
        await Student.updateMany(
            {},
            { $set: { examResult: null, attendance: null } }
        );

        res.send(deletedSubjects);
    } catch (error) {
    // ...removed for production...
        res.status(500).json(error);
    }
};

const deleteSubjectsByClass = async (req, res) => {
    try {
        const deletedSubjects = await Subject.deleteMany({ sclassName: req.params.id });

        // Set the teachSubject field to null in teachers
        await Teacher.updateMany(
            { teachSubject: { $in: deletedSubjects.map(subject => subject._id) } },
            { $unset: { teachSubject: "" }, $unset: { teachSubject: null } }
        );

        // Set examResult and attendance to null in all students
        await Student.updateMany(
            {},
            { $set: { examResult: null, attendance: null } }
        );

        res.send(deletedSubjects);
    } catch (error) {
    // ...removed for production...
        res.status(500).json(error);
    }
};


module.exports = { 
    subjectCreate, 
    freeSubjectList, 
    classSubjects, 
    getSubjectDetail, 
    deleteSubjectsByClass, 
    deleteSubjects, 
    deleteSubject, 
    allSubjects,
    teacherSubjects 
};