const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
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
        const { classId } = req.params;
        
        // Get all students in the class
        const students = await Student.find({ sclassName: classId })
            .populate({
                path: 'sclassName',
                select: 'sclassName'
            })
            .populate({
                path: 'school',
                select: 'schoolName'
            });

        if (!students || students.length === 0) {
            return res.status(404).json({ message: "No students found in this class" });
        }

        // Get all subjects for the class
        const subjects = await Subject.find({ sclassName: classId });

        // Calculate attendance for each student
        const studentsWithAttendance = await Promise.all(students.map(async (student) => {
            const subjectWiseAttendance = {};
            let totalAttendedDays = 0;
            let totalDays = 0;

            // Calculate attendance for each subject
            for (const subject of subjects) {
                const attendance = student.attendance?.filter(a => 
                    a.subName.toString() === subject._id.toString()
                ) || [];
                
                const attendedDays = attendance.filter(a => a.status === "Present").length;
                const totalSubjectDays = attendance.length;
                
                subjectWiseAttendance[subject.subName] = {
                    attended: attendedDays,
                    total: totalSubjectDays,
                    percentage: totalSubjectDays > 0 ? (attendedDays / totalSubjectDays) * 100 : 0
                };

                totalAttendedDays += attendedDays;
                totalDays += totalSubjectDays;
            }

            // Calculate overall percentage
            const overallPercentage = totalDays > 0 ? (totalAttendedDays / totalDays) * 100 : 0;

            return {
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum,
                email: student.email,
                status: student.status || 'active',
                attendance: {
                    subjects: subjectWiseAttendance,
                    overallPercentage: Math.round(overallPercentage * 100) / 100
                }
            };
        }));

        res.json(studentsWithAttendance);
    } catch (err) {
        console.error('Error getting student attendance:', err);
        res.status(500).json({ message: "Error fetching attendance data", error: err.message });
    }
};

const XLSX = require('xlsx');

const downloadAttendanceReport = async (req, res) => {
    try {
        const coordinator = await Coordinator.findById(req.params.id);
        if (!coordinator || !coordinator.assignedClass) {
            return res.status(404).json({ message: 'Coordinator or assigned class not found' });
        }

        const students = await Student.find({ sclassName: coordinator.assignedClass })
            .populate("attendance.subName", "subName");
        const subjects = await Subject.find({ sclassName: coordinator.assignedClass });
        const classInfo = await Sclass.findById(coordinator.assignedClass);

        if (!classInfo) {
            return res.status(404).json({ message: 'Class not found' });
        }

        // Format date as dd/mm/yyyy
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };

        // Create headers for Excel
        const headers = ['Roll No', 'Name', ...subjects.map(sub => sub.subName), 'Overall %'];
        const data = [
            [`Class: ${classInfo.sclassName}`, `Report Type: Subject-wise Attendance Report`],
            [],  // Empty row for spacing
            headers
        ];

        // Process student data
        students.forEach(student => {
            const row = [student.rollNum, student.name];
            let totalPercentage = 0;
            let validSubjectsCount = 0;

            subjects.forEach(subject => {
                const subjectAttendance = student.attendance.filter(
                    a => a.subName._id.toString() === subject._id.toString()
                );
                const present = subjectAttendance.filter(a => a.status === "Present").length;
                const total = subjectAttendance.length;
                const percentage = total === 0 ? 0 : (present / total) * 100;
                
                row.push(`${percentage.toFixed(1)}%`);
                if (total > 0) {
                    totalPercentage += percentage;
                    validSubjectsCount++;
                }
            });

            const averagePercentage = validSubjectsCount === 0 ? 0 : (totalPercentage / validSubjectsCount);
            row.push(`${averagePercentage.toFixed(1)}%`);
            data.push(row);
        });

        // Generate Excel file
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Style the title cells
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: subjects.length + 1 } }
        ];

        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, // Roll No
            { wch: 20 }, // Name
            ...subjects.map(() => ({ wch: 15 })), // Subject columns
            { wch: 12 }  // Overall percentage
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${classInfo.sclassName}_${formatDate(new Date())}.xlsx`);
        res.send(buffer);

    } catch (err) {
        console.error('Error generating attendance report:', err);
        res.status(500).json({ message: 'Failed to generate attendance report' });
    }
};

const getCoordinatorDetail = async (req, res) => {
    try {
        const coordinator = await Coordinator.findById(req.params.id)
            .populate("school", "schoolName")
            .populate("assignedClass", "sclassName");

        if (!coordinator) {
            return res.status(404).send({ message: "Coordinator not found" });
        }

        coordinator.password = undefined;
        res.send(coordinator);
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
    downloadAttendanceReport,
    getCoordinatorDetail
};
