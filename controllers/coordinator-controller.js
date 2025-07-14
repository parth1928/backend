const bcrypt = require('bcrypt');
const Coordinator = require('../models/coordinatorSchema.js');
const Sclass = require('../models/sclassSchema.js');
const Student = require('../models/studentSchema.js');
const Subject = require('../models/subjectSchema.js');
const Teacher = require('../models/teacherSchema.js');

const coordinatorRegister = async (req, res) => {
    const { name, email, password, role, school, assignedClass } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(password, salt);

        const coordinator = new Coordinator({
            name,
            email,
            password: hashedPass,
            role,
            school,
            assignedClass
        });

        const existingCoordinator = await Coordinator.findOne({ email });
        if (existingCoordinator) {
            res.send({ message: 'Email already exists' });
            return;
        }

        // Check if class already has a coordinator
        const existingClassCoordinator = await Coordinator.findOne({ assignedClass });
        if (existingClassCoordinator) {
            res.send({ message: 'This class already has a coordinator' });
            return;
        }

        const result = await coordinator.save();
        
        // Update the class with the coordinator
        await Sclass.findByIdAndUpdate(assignedClass, { coordinator: result._id });

        result.password = undefined;
        res.send(result);
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
};

const coordinatorLogin = async (req, res) => {
    try {
        let coordinator = await Coordinator.findOne({ email: req.body.email });
        if (coordinator) {
            const validated = await bcrypt.compare(req.body.password, coordinator.password);
            if (validated) {
                coordinator = await coordinator.populate("school", "schoolName");
                coordinator = await coordinator.populate("assignedClass", "sclassName");
                coordinator.password = undefined;
                res.send(coordinator);
            } else {
                res.send({ message: "Invalid password" });
            }
        } else {
            res.send({ message: "Coordinator not found" });
        }
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
};

const getClassDetails = async (req, res) => {
    try {
        const coordinator = await Coordinator.findById(req.params.id)
            .populate("assignedClass");
        
        if (!coordinator) {
            return res.status(404).send({ message: "Coordinator not found" });
        }

        // Get all students in the coordinator's class
        const students = await Student.find({ sclassName: coordinator.assignedClass });
        
        // Get all subjects in the coordinator's class
        const subjects = await Subject.find({ sclassName: coordinator.assignedClass });

        // Get all teachers teaching in this class
        const teachers = await Teacher.find({ teachSclass: coordinator.assignedClass })
            .populate("teachSubjects", "subName");

        res.send({
            classDetails: coordinator.assignedClass,
            students,
            subjects,
            teachers
        });
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
};

const getStudentsAttendance = async (req, res) => {
    try {
        const coordinator = await Coordinator.findById(req.params.id);
        const students = await Student.find({ sclassName: coordinator.assignedClass })
            .populate("attendance.subName", "subName");

        const subjects = await Subject.find({ sclassName: coordinator.assignedClass });

        // Calculate attendance percentage for each student per subject
        const studentsAttendance = students.map(student => {
            const subjectWiseAttendance = {};
            let totalPercentage = 0;
            let subjectCount = 0;

            subjects.forEach(subject => {
                const subjectAttendance = student.attendance.filter(
                    a => a.subName._id.toString() === subject._id.toString()
                );

                const present = subjectAttendance.filter(a => a.status === "Present").length;
                const total = subjectAttendance.length;
                const percentage = total === 0 ? 0 : (present / total) * 100;

                subjectWiseAttendance[subject.subName] = percentage;
                totalPercentage += percentage;
                subjectCount++;
            });

            const averagePercentage = subjectCount === 0 ? 0 : totalPercentage / subjectCount;

            return {
                enrollmentNo: student.rollNum,
                name: student.name,
                subjectWiseAttendance,
                totalAttendance: averagePercentage
            };
        });

        res.send({
            students: studentsAttendance,
            subjects: subjects.map(s => s.subName)
        });
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
};

const downloadAttendanceReport = async (req, res) => {
    try {
        const coordinator = await Coordinator.findById(req.params.id);
        const students = await Student.find({ sclassName: coordinator.assignedClass })
            .populate("attendance.subName", "subName");
        const subjects = await Subject.find({ sclassName: coordinator.assignedClass });

        // Create CSV content
        let csvContent = "Enrollment No,Name,";
        subjects.forEach(subject => {
            csvContent += `${subject.subName},`;
        });
        csvContent += "Total Attendance\n";

        students.forEach(student => {
            csvContent += `${student.rollNum},${student.name},`;
            
            let totalPercentage = 0;
            subjects.forEach(subject => {
                const subjectAttendance = student.attendance.filter(
                    a => a.subName._id.toString() === subject._id.toString()
                );
                const present = subjectAttendance.filter(a => a.status === "Present").length;
                const total = subjectAttendance.length;
                const percentage = total === 0 ? 0 : (present / total) * 100;
                
                csvContent += `${percentage.toFixed(2)}%,`;
                totalPercentage += percentage;
            });

            const averagePercentage = (totalPercentage / subjects.length).toFixed(2);
            csvContent += `${averagePercentage}%\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
        res.send(csvContent);
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
};

module.exports = {
    coordinatorRegister,
    coordinatorLogin,
    getClassDetails,
    getStudentsAttendance,
    downloadAttendanceReport
};
