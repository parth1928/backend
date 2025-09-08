const bcrypt = require('bcrypt');
const Teacher = require('../models/teacherSchema.js');
const Subject = require('../models/subjectSchema.js');
const Sclass = require('../models/sclassSchema.js');
const TeacherSubjectClass = require('../models/teacherSubjectClassSchema.js');

const teacherRegister = async (req, res) => {
    const { name, email, password, role, school, teachSubjects, teachSclass } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(password, salt);

        const teacher = new Teacher({ name, email, password: hashedPass, role, school, teachSubjects, teachSclass });

        const existingTeacherByEmail = await Teacher.findOne({ email });

        if (existingTeacherByEmail) {
            res.send({ message: 'Email already exists' });
        }
        else {
            let result = await teacher.save();
            // Add this teacher to all assigned subjects
            if (teachSubjects && teachSubjects.length > 0) {
                await Subject.updateMany(
                    { _id: { $in: teachSubjects } },
                    { $push: { teachers: teacher._id } }
                );
            }
            result.password = undefined;
            res.send(result);
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

const teacherLogIn = async (req, res) => {
    console.log('Teacher login attempt:', { 
        email: req.body.email, 
        hasPassword: !!req.body.password 
    });
    
    try {
        let teacher = await Teacher.findOne({ email: req.body.email });
        console.log('Teacher found:', !!teacher);
        
        if (teacher) {
            const validated = await bcrypt.compare(req.body.password, teacher.password);
            console.log('Password validation:', validated);
            
            if (validated) {
                teacher = await teacher.populate("teachSubjects", "subName sessions");
                teacher = await teacher.populate("school", "schoolName");
                teacher = await teacher.populate("teachSclass", "sclassName");
                
                teacher = teacher.toObject();
                delete teacher.password;
                teacher.role = 'Teacher'; // Explicitly set the role
                
                console.log('Teacher login successful');
                res.send(teacher);
            } else {
                console.log('Invalid password for teacher');
                res.send({ message: "Invalid password" });
            }
        } else {
            console.log('Teacher not found');
            res.send({ message: "Teacher not found" });
        }
    } catch (err) {
        console.error('Teacher login error:', err);
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

const getTeachers = async (req, res) => {
    try {
        let teachers = await Teacher.find({ school: req.params.id })
            .populate("teachSubjects", "subName")
            .populate("teachSclass", "sclassName");
        if (teachers.length > 0) {
            let modifiedTeachers = teachers.map((teacher) => {
                return { ...teacher._doc, password: undefined };
            });
            res.send(modifiedTeachers);
        } else {
            res.send({ message: "No teachers found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
};

const getTeacherDetail = async (req, res) => {
    try {
        let teacher = await Teacher.findById(req.params.id)
            .populate("teachSubjects", "subName sessions")
            .populate("school", "schoolName")
            .populate("teachSclass", "sclassName")
        if (teacher) {
            teacher.password = undefined;
            res.send(teacher);
        }
        else {
            res.send({ message: "No teacher found" });
        }
    } catch (err) {
    // ...removed for production...
        res.status(500).json(err);
    }
}

const updateTeacherSubject = async (req, res) => {
    const { teacherId, subjectAssignments } = req.body;

    try {
        const teacher = await Teacher.findById(teacherId);
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        // Remove existing TeacherSubjectClass records for this teacher
        await TeacherSubjectClass.deleteMany({ teacher: teacherId });

        // Create new TeacherSubjectClass records
        const newAssignments = [];

        for (const assignment of subjectAssignments) {
            const { subjectId, classId, batch } = assignment;

            // Validate subject exists
            const subject = await Subject.findById(subjectId);
            if (!subject) {
                return res.status(404).json({ message: `Subject ${subjectId} not found` });
            }

            // Validate class exists
            const sclass = await Sclass.findById(classId);
            if (!sclass) {
                return res.status(404).json({ message: `Class ${classId} not found` });
            }

            // For lab subjects, validate batch exists
            if (subject.isLab && batch) {
                const batchExists = subject.batches.some(b => b.batchName === batch);
                if (!batchExists) {
                    return res.status(400).json({
                        message: `Batch ${batch} not found for subject ${subject.subName}`
                    });
                }
            }

            // Create TeacherSubjectClass record
            const teacherSubjectClass = new TeacherSubjectClass({
                teacher: teacherId,
                subject: subjectId,
                sclass: classId,
                batch: subject.isLab ? batch : null,
                school: teacher.school
            });

            await teacherSubjectClass.save();
            newAssignments.push(teacherSubjectClass);
        }

        // Update teacher's teachSubjects array (for backward compatibility)
        const subjectIds = subjectAssignments.map(a => a.subjectId);
        await Teacher.findByIdAndUpdate(teacherId, { teachSubjects: subjectIds });

        res.json({
            message: 'Teacher subject assignments updated successfully',
            assignments: newAssignments
        });

    } catch (error) {
        console.error('Error updating teacher subjects:', error);
        if (error.code === 11000) {
            res.status(400).json({
                message: 'This teacher is already assigned to the same subject-class combination. Please check your selections.'
            });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
};

const deleteTeacher = async (req, res) => {
    try {
        const deletedTeacher = await Teacher.findByIdAndDelete(req.params.id);

        // Remove the teacher from all subjects they were teaching
        await Subject.updateMany(
            { teachers: deletedTeacher._id },
            { $pull: { teachers: deletedTeacher._id } }
        );

        res.send(deletedTeacher);
    } catch (error) {
    // ...removed for production...
        res.status(500).json(error);
    }
};

const deleteTeachers = async (req, res) => {
    try {
        const deletionResult = await Teacher.deleteMany({ school: req.params.id });

        const deletedCount = deletionResult.deletedCount || 0;

        if (deletedCount === 0) {
            res.send({ message: "No teachers found to delete" });
            return;
        }

        const deletedTeachers = await Teacher.find({ school: req.params.id });

        await Subject.updateMany(
            { teacher: { $in: deletedTeachers.map(teacher => teacher._id) }, teacher: { $exists: true } },
            { $unset: { teacher: "" }, $unset: { teacher: null } }
        );

        res.send(deletionResult);
    } catch (error) {
    // ...removed for production...
        res.status(500).json(error);
    }
};

const deleteTeachersByClass = async (req, res) => {
    try {
        const deletionResult = await Teacher.deleteMany({ sclassName: req.params.id });

        const deletedCount = deletionResult.deletedCount || 0;

        if (deletedCount === 0) {
            res.send({ message: "No teachers found to delete" });
            return;
        }

        const deletedTeachers = await Teacher.find({ sclassName: req.params.id });

        await Subject.updateMany(
            { teacher: { $in: deletedTeachers.map(teacher => teacher._id) }, teacher: { $exists: true } },
            { $unset: { teacher: "" }, $unset: { teacher: null } }
        );

        res.send(deletionResult);
    } catch (error) {
    // ...removed for production...
        res.status(500).json(error);
    }
};

const getTeacherSubjectAssignments = async (req, res) => {
    try {
        const { teacherId } = req.params;

        const assignments = await TeacherSubjectClass.find({ teacher: teacherId })
            .populate('subject', 'subName subCode sessions isLab batches')
            .populate('sclass', 'sclassName')
            .populate('teacher', 'name email');

        res.json({
            assignments: assignments.map(assignment => ({
                _id: assignment._id,
                subject: assignment.subject,
                sclass: assignment.sclass,
                batch: assignment.batch,
                schedule: assignment.schedule,
                isActive: assignment.isActive
            }))
        });

    } catch (error) {
        console.error('Error getting teacher subject assignments:', error);
        res.status(500).json({ message: error.message });
    }
};

const getAllTeacherSubjectAssignments = async (req, res) => {
    try {
        const assignments = await TeacherSubjectClass.find({})
            .populate('subject', 'subName subCode sessions isLab batches')
            .populate('sclass', 'sclassName')
            .populate('teacher', 'name email')
            .sort({ 'subject.subName': 1, 'teacher.name': 1 });

        res.json({
            assignments: assignments.map(assignment => ({
                _id: assignment._id,
                subject: assignment.subject,
                sclass: assignment.sclass,
                teacher: assignment.teacher,
                batch: assignment.batch,
                schedule: assignment.schedule,
                isActive: assignment.isActive
            }))
        });

    } catch (error) {
        console.error('Error getting all teacher subject assignments:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    teacherRegister,
    teacherLogIn,
    getTeachers,
    getTeacherDetail,
    updateTeacherSubject,
    getTeacherSubjectAssignments,
    getAllTeacherSubjectAssignments,
    deleteTeacher,
    deleteTeachers,
    deleteTeachersByClass
};