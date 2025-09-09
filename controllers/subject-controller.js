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
            teachers: subject.teachers || [],
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
            
            // Update teachers' subject lists for subjects that have teachers assigned
            for (const subject of result) {
                if (subject.teachers && subject.teachers.length > 0) {
                    await Teacher.updateMany(
                        { _id: { $in: subject.teachers } },
                        { $addToSet: { teachSubjects: subject._id } }
                    );
                }
            }
            
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
            .populate("teachers", "name")
            .populate("sclassName", "sclassName");
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

const updateSubjectTeachers = async (req, res) => {
    try {
        const { id } = req.params;
        const { teachers } = req.body;

        if (!Array.isArray(teachers)) {
            return res.status(400).json({ message: 'Teachers must be an array' });
        }

        // Get the current subject to find previously assigned teachers
        const currentSubject = await Subject.findById(id);
        if (!currentSubject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        const previousTeachers = currentSubject.teachers || [];

        // Update the subject with new teachers
        const updatedSubject = await Subject.findByIdAndUpdate(
            id,
            { teachers },
            { new: true }
        ).populate('teachers', 'name')
         .populate('sclassName', 'sclassName');

        if (!updatedSubject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        // Update teacher subject lists
        // Add subject to newly assigned teachers
        const newTeachers = teachers.filter(teacherId => !previousTeachers.includes(teacherId));
        for (const teacherId of newTeachers) {
            await Teacher.findByIdAndUpdate(
                teacherId,
                { $addToSet: { teachSubjects: id } }
            );
        }

        // Remove subject from previously assigned teachers who are no longer assigned
        const removedTeachers = previousTeachers.filter(teacherId => !teachers.includes(teacherId.toString()));
        for (const teacherId of removedTeachers) {
            await Teacher.findByIdAndUpdate(
                teacherId,
                { $pull: { teachSubjects: id } }
            );
        }

        res.json(updatedSubject);
    } catch (error) {
        console.error('Error updating subject teachers:', error);
        res.status(500).json({ message: 'Failed to update subject teachers', error: error.message });
    }
};

const deleteSubjectsByClass = async (req, res) => {
    try {
        const classId = req.params.id;
        console.log('Deleting subjects for class ID:', classId);

        // Find all subjects for this class
        const subjectsToDelete = await Subject.find({ sclassName: classId });

        if (subjectsToDelete.length === 0) {
            return res.status(404).json({ message: "No subjects found for this class" });
        }

        // Delete all subjects for this class
        const deletedSubjects = await Subject.deleteMany({ sclassName: classId });

        // Update teachers who had these subjects assigned
        const subjectIds = subjectsToDelete.map(subject => subject._id);
        await Teacher.updateMany(
            { teachSubjects: { $in: subjectIds } },
            { $pull: { teachSubjects: { $in: subjectIds } } }
        );

        // Remove attendance records for these subjects from students
        await Student.updateMany(
            { 'attendance.subName': { $in: subjectIds } },
            { $pull: { attendance: { subName: { $in: subjectIds } } } }
        );

        // Remove exam results for these subjects from students
        await Student.updateMany(
            { 'examResult.subName': { $in: subjectIds } },
            { $pull: { examResult: { subName: { $in: subjectIds } } } }
        );

        console.log(`Deleted ${deletedSubjects.deletedCount} subjects for class ${classId}`);
        res.status(200).json({
            message: `Deleted ${deletedSubjects.deletedCount} subjects for class ${classId}`,
            deletedCount: deletedSubjects.deletedCount
        });
    } catch (error) {
        console.error('Error deleting subjects by class:', error);
        res.status(500).json({ message: 'Error deleting subjects by class', error: error.message });
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
    teacherSubjects,
    updateSubjectTeachers
};