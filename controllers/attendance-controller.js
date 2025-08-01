const Student = require('../models/studentSchema');
const DtodStudent = require('../models/dtodStudentSchema');
const Sclass = require('../models/sclassSchema');
const Subject = require('../models/subjectSchema');
const XLSX = require('xlsx');

// Helper function to calculate attendance percentages
const calculateAttendanceStats = (student, subjects) => {
    const subjectPercentages = subjects.map(subject => {
        const subAttendance = student.attendance?.filter(att => 
            att.subName && att.subName._id.toString() === subject._id.toString()
        ) || [];
        
        if (subAttendance.length === 0) return 0;
        const present = subAttendance.filter(att => att.status === 'Present').length;
        return (present / subAttendance.length) * 100;
    });

    const overallPercentage = subjectPercentages.length > 0
        ? subjectPercentages.reduce((a, b) => a + b, 0) / subjectPercentages.length
        : 0;

    return {
        subjectPercentages,
        overallPercentage: Math.round(overallPercentage * 10) / 10
    };
};

const downloadAttendanceExcel = async (req, res) => {

    try {
        const { classId, subjectId } = req.params;
        const { batch: batchName } = req.query;

        // Get all students in class
        let students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        let dtodStudents = await DtodStudent.find({ sclassName: classId }).populate('attendance.subName');

        const classInfo = await Sclass.findById(classId);
        const subjectInfo = await Subject.findById(subjectId);

        if (!classInfo || !subjectInfo) {
            return res.status(404).json({ message: 'Class or subject not found' });
        }

        // If batchName is provided and subject is lab, filter students to only those in the batch
        let batchStudentIds = [];
        if (batchName && subjectInfo.isLab && Array.isArray(subjectInfo.batches)) {
            const batch = subjectInfo.batches.find(b => b.batchName === batchName);
            if (batch) {
                batchStudentIds = batch.students.map(id => id.toString());
            }
        }

        // Collect all dates for this subject (from both regular and D2D students)
        const dateSet = new Set();
        students.forEach(student => {
            student.attendance?.forEach(att => {
                if (att.subName && att.subName._id.toString() === subjectId) {
                    dateSet.add(new Date(att.date).toISOString().slice(0, 10));
                }
            });
        });
        dtodStudents.forEach(student => {
            student.attendance?.forEach(att => {
                if (att.subName && att.subName._id.toString() === subjectId) {
                    dateSet.add(new Date(att.date).toISOString().slice(0, 10));
                }
            });
        });
        const dates = Array.from(dateSet).sort();

        // Format date as dd/mm/yyyy
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };

        // Create Excel data
        const headers = ['Roll No', 'Name', ...dates.map(d => formatDate(d)), '% Attendance'];
        const data = [
            [`Class: ${classInfo.sclassName}`, `Subject: ${subjectInfo.subName}`],
            [],  // Empty row for spacing
            headers
        ];

        // Add regular student rows
        students.forEach(student => {
            // If batchName is set, only fill attendance for students in batch, others blank
            if (batchName && subjectInfo.isLab && batchStudentIds.length > 0 && !batchStudentIds.includes(student._id.toString())) {
                // Not in batch: leave attendance cells blank
                const row = [student.rollNum, student.name, ...Array(dates.length).fill(''), ''];
                data.push(row);
                return;
            }
            const row = [student.rollNum, student.name];
            let presentCount = 0;
            dates.forEach(date => {
                const attendance = student.attendance?.find(a => 
                    a.subName && 
                    a.subName._id.toString() === subjectId &&
                    new Date(a.date).toISOString().slice(0, 10) === date
                );
                // If batchName is set and student is not in batch, leave blank
                if (batchName && subjectInfo.isLab && batchStudentIds.length > 0 && !batchStudentIds.includes(student._id.toString())) {
                    row.push('');
                } else {
                    const status = attendance?.status === 'Present' ? 'P' : (attendance ? 'A' : '');
                    if (status === 'P') presentCount++;
                    row.push(status);
                }
            });
            const percentage = dates.length ? ((presentCount / dates.length) * 100).toFixed(2) + '%' : '0%';
            row.push(percentage);
            data.push(row);
        });

        // Add D2D student rows
        dtodStudents.forEach(student => {
            const row = [student.rollNum, `${student.name} (D2D)`];
            let presentCount = 0;
            dates.forEach(date => {
                // Find attendance for this subject and date
                const attendance = student.attendance?.find(a => 
                    a.subName &&
                    (a.subName._id?.toString() === subjectId || a.subName.toString() === subjectId) &&
                    new Date(a.date).toISOString().slice(0, 10) === date
                );
                const status = attendance?.status === 'Present' ? 'P' : (attendance ? 'A' : '');
                if (status === 'P') presentCount++;
                row.push(status);
            });
            const percentage = dates.length ? ((presentCount / dates.length) * 100).toFixed(2) + '%' : '0%';
            row.push(percentage);
            data.push(row);
        });

        // Generate Excel file
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Style the title cells
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: dates.length + 2 } }
        ];

        // Format date columns
        for (let i = 2; i < dates.length + 2; i++) {
            const col = XLSX.utils.encode_col(i);
            for (let row = 3; row < data.length; row++) {
                const cell = col + (row + 1);
                if (!ws[cell]) continue;
                if (!ws['!cols']) ws['!cols'] = [];
                if (!ws['!cols'][i]) ws['!cols'][i] = { wch: 12 }; // Set column width
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.send(buffer);

    } catch (error) {
    // ...removed for production...
        res.status(500).json({ message: 'Failed to generate attendance report' });
    }
};

const downloadCoordinatorReport = async (req, res) => {
    try {
        const { classId } = req.params;
        const { adminId } = req.query;

        // Get all students and subjects for the class
        const students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ sclassName: classId, school: adminId }).populate('attendance.subName');
        const subjects = await Subject.find({ sclassName: classId });
        const classInfo = await Sclass.findById(classId);

        if (!classInfo) {
            return res.status(404).json({ message: 'Class not found' });
        }

        // Create headers
        const headers = ['Roll No', 'Name', 'Type', ...subjects.map(sub => sub.subName), 'Overall %'];
        const data = [
            [`Class: ${classInfo.sclassName}`, `Report Type: Subject-wise Attendance`],
            [],  // Empty row for spacing
            headers
        ];

        // Process all students
        [...students, ...dtodStudents].forEach(student => {
            const stats = calculateAttendanceStats(student, subjects);
            const row = [
                student.rollNum,
                student.name,
                student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular',
                ...stats.subjectPercentages.map(p => `${p.toFixed(1)}%`),
                `${stats.overallPercentage}%`
            ];
            data.push(row);
        });

        // Generate Excel file
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Style the title cells
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: subjects.length + 2 } }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.send(buffer);

    } catch (error) {
    // ...removed for production...
        res.status(500).json({ message: 'Failed to generate attendance report' });
    }
};

const getClassAttendance = async (req, res) => {
    try {
        const { classId } = req.params;

        // Get all students in class
        const students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ sclassName: classId }).populate('attendance.subName');

        // Get all subjects for this class
        const subjects = await Subject.find({ sclassName: classId });

        // Process all students using the helper function
        const processStudentAttendance = (student, type) => {
            const stats = calculateAttendanceStats(student, subjects);
            return {
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum,
                type: type,
                attendance: {
                    overallPercentage: stats.overallPercentage,
                    subjectWise: subjects.map((subject, index) => ({
                        subject: subject.subName,
                        percentage: Math.round(stats.subjectPercentages[index] * 10) / 10
                    }))
                }
            };
        };

        // Process both regular and D2D students
        const allStudents = [
            ...students.map(s => processStudentAttendance(s, 'Regular')),
            ...dtodStudents.map(s => processStudentAttendance(s, 'D2D'))
        ];

        // Calculate class averages
        const classAverage = Math.round(
            (allStudents.reduce((sum, student) => 
                sum + student.attendance.overallPercentage, 0) / allStudents.length) * 10
        ) / 10;

        res.json({
            students: allStudents,
            classStats: {
                totalStudents: allStudents.length,
                averageAttendance: classAverage,
                subjects: subjects.map(sub => sub.subName)
            }
        });

    } catch (error) {
    // ...removed for production...
        res.status(500).json({ message: 'Failed to calculate attendance statistics' });
    }
};




/**
 * Bulk mark attendance for students (regular and D2D)
 * Expects req.body.attendanceList: [
 *   { studentId, isDtod, date, status, subName }
 * ]
 */
const bulkMarkAttendance = async (req, res) => {
    try {
        const { attendanceList } = req.body;
        if (!Array.isArray(attendanceList) || attendanceList.length === 0) {
            return res.status(400).json({ message: 'attendanceList is required and must be non-empty' });
        }

        // Split into regular and D2D, and create separate pull and push ops
        const regularPullOps = [];
        const regularPushOps = [];
        const dtodPullOps = [];
        const dtodPushOps = [];
        for (const record of attendanceList) {
            const { studentId, isDtod, date, status, subName } = record;
            if (!studentId || !date || !status || !subName) continue;
            // Auto-detect D2D if isDtod is not set
            let isD2D = isDtod;
            if (typeof isD2D === 'undefined') {
                const found = await DtodStudent.findById(studentId);
                isD2D = !!found;
            }
            const pullOp = {
                updateOne: {
                    filter: { _id: studentId },
                    update: { $pull: { attendance: { date: new Date(date), subName: subName } } }
                }
            };
            const pushOp = {
                updateOne: {
                    filter: { _id: studentId },
                    update: { $push: { attendance: { date: new Date(date), status, subName: subName } } }
                }
            };
            if (isD2D) {
                const result = await DtodStudent.bulkWrite([pullOp, pushOp]);
                console.log('Bulk attendance update for D2D:', studentId, result);
            } else {
                const result = await Student.bulkWrite([pullOp, pushOp]);
                console.log('Bulk attendance update for regular:', studentId, result);
            }
        }

        // Debug: log the incoming data and first operation
        console.log('Received attendanceList:', JSON.stringify(attendanceList, null, 2));
        if (regularPullOps.length > 0) console.log('First regularPullOp:', JSON.stringify(regularPullOps[0], null, 2));
        if (regularPushOps.length > 0) console.log('First regularPushOp:', JSON.stringify(regularPushOps[0], null, 2));
        if (dtodPullOps.length > 0) console.log('First dtodPullOp:', JSON.stringify(dtodPullOps[0], null, 2));
        if (dtodPushOps.length > 0) console.log('First dtodPushOp:', JSON.stringify(dtodPushOps[0], null, 2));

        // Bulk write for regular students
        if (regularPullOps.length > 0) {
            await Student.bulkWrite(regularPullOps);
        }
        if (regularPushOps.length > 0) {
            await Student.bulkWrite(regularPushOps);
        }
        // Bulk write for D2D students
        if (dtodPullOps.length > 0) {
            await DtodStudent.bulkWrite(dtodPullOps);
        }
        if (dtodPushOps.length > 0) {
            await DtodStudent.bulkWrite(dtodPushOps);
        }

        res.json({ message: 'Bulk attendance marked successfully' });
    } catch (error) {
        console.error('Bulk attendance error:', error);
        res.status(500).json({ message: 'Bulk attendance marking failed', error: error.message });
    }
};

/**
 * Quick attendance marking endpoint
 */
const quickMarkAttendance = async (req, res) => {
    try {
        const { classId, subjectId, rollSuffix, date, mode, preview, students } = req.body;

        // Function to find students by roll suffix
        const findStudentsByRollSuffix = async () => {
            let rollNumPattern;
            if (rollSuffix.toLowerCase().startsWith('d')) {
                // D2D roll number pattern
                rollNumPattern = new RegExp(`^${rollSuffix}$`, 'i');
            } else {
                // Regular roll number pattern - match ending digits
                rollNumPattern = new RegExp(`${rollSuffix.padStart(2, '0')}$`);
            }

            // Query both regular and D2D students
            const regularStudents = await Student.find({ 
                sclassName: classId,
                rollNum: rollNumPattern 
            });

            const dtodStudents = await DtodStudent.find({ 
                sclassName: classId,
                rollNum: rollNumPattern 
            });

            // If students array is provided (for batch filtering), filter the results
            let filteredStudents = [...regularStudents, ...dtodStudents];
            if (students && Array.isArray(students)) {
                filteredStudents = filteredStudents.filter(student => 
                    students.includes(student._id.toString())
                );
            }

            return filteredStudents;
        };

        const matches = await findStudentsByRollSuffix();

        if (matches.length === 0) {
            return res.status(404).json({ message: 'No student found with given roll number' });
        }

        // If preview mode, just return the matched student(s)
        if (preview) {
            return res.json({ 
                success: true, 
                student: matches[0],
                multipleMatches: matches.length > 1 ? matches : null 
            });
        }

        // Get the first matching student (frontend should handle multiple matches)
        const student = matches[0];

        // Remove any existing attendance for this date and subject
        if (student.constructor.modelName === 'DtodStudent') {
            const pullRes = await DtodStudent.updateOne(
                { _id: student._id },
                { $pull: { attendance: { date: new Date(date), subName: subjectId } } }
            );
            const pushRes = await DtodStudent.updateOne(
                { _id: student._id },
                { $push: { attendance: {
                    date: new Date(date),
                    status: mode === 'present' ? 'Present' : 'Absent',
                    subName: subjectId
                } } }
            );
            console.log('Quick attendance update for D2D:', student._id, { pullRes, pushRes });
        } else {
            const pullRes = await Student.updateOne(
                { _id: student._id },
                { $pull: { attendance: { date: new Date(date), subName: subjectId } } }
            );
            const pushRes = await Student.updateOne(
                { _id: student._id },
                { $push: { attendance: {
                    date: new Date(date),
                    status: mode === 'present' ? 'Present' : 'Absent',
                    subName: subjectId
                } } }
            );
            console.log('Quick attendance update for regular:', student._id, { pullRes, pushRes });
        }

        res.json({ 
            success: true, 
            student: {
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum
            }
        });

    } catch (error) {
        console.error('Quick attendance error:', error);
        res.status(500).json({ message: 'Quick attendance marking failed', error: error.message });
    }
};

const quickSubmitAttendance = async (req, res) => {
    try {
        const { classId, subjectId, date, markedStudents, mode } = req.body;

        // Validate input
        if (!Array.isArray(markedStudents) || markedStudents.length === 0) {
            return res.status(400).json({ message: 'No students provided for attendance' });
        }

        // Split students into regular and D2D
        const regularStudents = markedStudents.filter(s => !s.isDtod);
        const dtodStudents = markedStudents.filter(s => s.isDtod);

        // Function to process a group of students
        const processStudents = async (students, Model) => {
            const operations = students.map(student => ([
                {
                    updateOne: {
                        filter: { _id: student._id },
                        update: { $pull: { attendance: { date: new Date(date), subName: subjectId } } }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: student._id },
                        update: {
                            $push: {
                                attendance: {
                                    date: new Date(date),
                                    status: mode === 'present' ? 'Present' : 'Absent',
                                    subName: subjectId
                                }
                            }
                        }
                    }
                }
            ])).flat();

            if (operations.length > 0) {
                await Model.bulkWrite(operations);
            }
        };

        // Process regular and D2D students in parallel
        await Promise.all([
            processStudents(regularStudents, Student),
            processStudents(dtodStudents, DtodStudent)
        ]);

        res.json({ 
            success: true, 
            message: 'Attendance submitted successfully' 
        });

    } catch (error) {
        console.error('Quick submit attendance error:', error);
        res.status(500).json({ 
            message: 'Failed to submit attendance', 
            error: error.message 
        });
    }
};

module.exports = {
    downloadAttendanceExcel,
    downloadCoordinatorReport,
    getClassAttendance,
    bulkMarkAttendance,
    quickMarkAttendance,
    quickSubmitAttendance
};
