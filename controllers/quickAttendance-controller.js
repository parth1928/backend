
const Student = require('../models/studentSchema');
const DtodStudent = require('../models/dtodStudentSchema');

const quickMarkAttendance = async (req, res) => {
    try {
        const { classId, subjectId, date, rollSuffix, mode } = req.body;

        // Input validation
        if (!classId || !subjectId || !date || !rollSuffix || !mode) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if D2D student (rollSuffix starts with D or d)
        let isDtod = false;
        let paddedSuffix = rollSuffix;
        if (typeof rollSuffix === 'string' && (rollSuffix[0] === 'D' || rollSuffix[0] === 'd')) {
            isDtod = true;
            paddedSuffix = rollSuffix.slice(1).padStart(2, '0');
        } else {
            paddedSuffix = rollSuffix.toString().padStart(2, '0');
        }
        console.log('Looking for roll suffix:', paddedSuffix, 'isDtod:', isDtod); // Debug log

        let matchedStudent;
        if (isDtod) {
            // Find D2D students in the class
            const students = await DtodStudent.find({ sclassName: classId });
            console.log('Found D2D students in class:', students.map(s => ({ name: s.name, roll: s.rollNum })));
            matchedStudent = students.find(student => {
                const rollStr = student.rollNum.toString();
                const suffix = rollStr.slice(-2).padStart(2, '0');
                console.log('Comparing D2D', suffix, 'with', paddedSuffix);
                return suffix === paddedSuffix;
            });
        } else {
            // Find regular students in the class
            const students = await Student.find({ sclassName: classId });
            console.log('Found students in class:', students.map(s => ({ name: s.name, roll: s.rollNum })));
            matchedStudent = students.find(student => {
                const rollStr = student.rollNum.toString();
                const suffix = rollStr.slice(-2).padStart(2, '0');
                console.log('Comparing', suffix, 'with', paddedSuffix);
                return suffix === paddedSuffix;
            });
        }

        if (!matchedStudent) {
            return res.status(404).json({ 
                success: false, 
                message: `No ${isDtod ? 'D2D' : 'regular'} student found with roll number ending in ${paddedSuffix}` 
            });
        }

        console.log('Found matching student:', matchedStudent.name, matchedStudent.rollNum, 'isDtod:', isDtod);

        // Update student's attendance
        const attendanceRecord = {
            subName: subjectId,
            date: new Date(date),
            status: mode === 'present' ? 'Present' : 'Absent'
        };

        // Check for existing attendance record
        if (!matchedStudent.attendance) matchedStudent.attendance = [];
        const existingRecord = matchedStudent.attendance.find(a => 
            a.subName.toString() === subjectId &&
            new Date(a.date).toISOString().slice(0,10) === date
        );

        if (existingRecord) {
            existingRecord.status = mode === 'present' ? 'Present' : 'Absent';
            console.log('Updated existing attendance record');
        } else {
            matchedStudent.attendance.push(attendanceRecord);
            console.log('Added new attendance record');
        }

        await matchedStudent.save();

        return res.json({ 
            success: true, 
            student: {
                name: matchedStudent.name,
                rollNum: matchedStudent.rollNum
            }
        });
    } catch (error) {
        console.error('Quick attendance error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to mark attendance'
        });
    }
};

const submitQuickAttendance = async (req, res) => {
    try {
        const { classId, subjectId, date, markedStudents, mode } = req.body;

        // Get all students in the class
        const allStudents = await Student.find({ sclassName: classId });

        // Create attendance records
        const operations = allStudents.map(student => {
            const isMarked = markedStudents.some(m => m.rollNum === student.rollNum);
            const status = mode === 'present' ? 
                (isMarked ? 'Present' : 'Absent') : 
                (isMarked ? 'Absent' : 'Present');

            // Find existing record or create new one
            const existingRecord = student.attendance.find(a => 
                a.subName.toString() === subjectId &&
                new Date(a.date).toISOString().slice(0,10) === date
            );

            if (existingRecord) {
                existingRecord.status = status;
            } else {
                student.attendance.push({
                    subName: subjectId,
                    date: new Date(date),
                    status
                });
            }

            return student.save();
        });

        await Promise.all(operations);

        res.json({ 
            success: true, 
            message: 'Attendance submitted successfully' 
        });
    } catch (error) {
        console.error('Submit quick attendance error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit attendance' 
        });
    }
};

module.exports = {
    quickMarkAttendance,
    submitQuickAttendance
};
