const nodemailer = require('nodemailer');
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
                
                // If this is a lab subject with batches, filter D2D students
                // For D2D students, we include them in all batches since they typically attend all sessions
                // Don't filter dtodStudents - keep them all for lab batches
            }
        }


        // Collect all attendance entries for this subject (from both regular and D2D students)
        // Group by date and count occurrences per student per date
        const dateOccurrences = {};
        const allStudents = [...students, ...dtodStudents];
        
        // First, gather all unique dates
        const allDates = new Set();
        allStudents.forEach(student => {
            student.attendance?.forEach(att => {
                if (att.subName && (att.subName._id?.toString() === subjectId || att.subName.toString() === subjectId)) {
                    const dateStr = new Date(att.date).toISOString().slice(0, 10);
                    allDates.add(dateStr);
                }
            });
        });
        
        // Now for each date, count the maximum number of occurrences for any student
        Array.from(allDates).forEach(dateStr => {
            dateOccurrences[dateStr] = {};
            
            allStudents.forEach(student => {
                // Get all attendance entries for this student on this date for this subject
                const dateAttendances = student.attendance?.filter(att => 
                    att.subName && 
                    (att.subName._id?.toString() === subjectId || att.subName.toString() === subjectId) &&
                    new Date(att.date).toISOString().slice(0, 10) === dateStr
                ) || [];
                
                // Update max occurrence count for this date
                if (dateAttendances.length > 0) {
                    for (let i = 0; i < dateAttendances.length; i++) {
                        const occurrenceIndex = i + 1;
                        if (!dateOccurrences[dateStr][occurrenceIndex] || 
                            dateOccurrences[dateStr][occurrenceIndex] < 1) {
                            dateOccurrences[dateStr][occurrenceIndex] = 1;
                        } else {
                            dateOccurrences[dateStr][occurrenceIndex]++;
                        }
                    }
                }
            });
        });

        // Build columns: for each date, add columns for each occurrence
        const dateColumns = [];
        Object.keys(dateOccurrences).sort().forEach(dateStr => {
            const occurrences = dateOccurrences[dateStr];
            const occurrenceKeys = Object.keys(occurrences).map(k => parseInt(k)).sort((a, b) => a - b);
            
            for (const occurrenceIndex of occurrenceKeys) {
                dateColumns.push({ dateStr, occurrence: occurrenceIndex });
            }
        });

        // Format date as dd/mm/yyyy #n
        const formatDate = (dateStr, occurrence) => {
            const date = new Date(dateStr);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year} #${occurrence}`;
        };

        // Create Excel data
        const headers = ['Roll No', 'Name', ...dateColumns.map(d => formatDate(d.dateStr, d.occurrence)), '% Attendance'];
        const data = [
            [`Class: ${classInfo.sclassName}`, `Subject: ${subjectInfo.subName}${batchName ? `, Batch: ${batchName}` : ''}`],
            [],  // Empty row for spacing
            ["Regular Students"],
            headers
        ];

        // Add regular student rows
        students.forEach(student => {
            if (batchName && subjectInfo.isLab && batchStudentIds.length > 0 && !batchStudentIds.includes(student._id.toString())) {
                // Skip students not in the selected batch for lab subjects
                return;
            }
            
            const row = [student.rollNum, student.name];
            let presentCount = 0;
            let totalEntries = 0;
            
            // For each date/occurrence column, find the nth attendance for that date
            dateColumns.forEach(({ dateStr, occurrence }) => {
                // Get all attendance entries for this date and subject
                const dateAttendances = student.attendance?.filter(a =>
                    a.subName && 
                    (a.subName._id?.toString() === subjectId || a.subName.toString() === subjectId) &&
                    new Date(a.date).toISOString().slice(0, 10) === dateStr
                ).sort((a, b) => new Date(a.date) - new Date(b.date)) || [];
                
                // Get the attendance for this specific occurrence if it exists
                const attendance = occurrence <= dateAttendances.length ? dateAttendances[occurrence - 1] : null;
                
                if (attendance) {
                    totalEntries++;
                    const status = attendance.status === 'Present' ? 'P' : 'A';
                    if (status === 'P') presentCount++;
                    row.push(status);
                } else {
                    row.push(''); // No attendance entry for this occurrence
                }
            });
            
            const percentage = totalEntries ? ((presentCount / totalEntries) * 100).toFixed(2) + '%' : '0%';
            row.push(percentage);
            data.push(row);
        });

        // Add a section title for D2D students if there are any
        if (dtodStudents.length > 0) {
            data.push([]);  // Empty row for spacing
            data.push(["D2D Students"]);
            
            // Add D2D student rows
            dtodStudents.forEach(student => {
                const row = [student.rollNum, `${student.name} (D2D)`];
                let presentCount = 0;
                let totalEntries = 0;
                
                dateColumns.forEach(({ dateStr, occurrence }) => {
                    // Get all attendance entries for this date and subject
                    const dateAttendances = student.attendance?.filter(a =>
                        a.subName && 
                        (a.subName._id?.toString() === subjectId || a.subName.toString() === subjectId) &&
                        new Date(a.date).toISOString().slice(0, 10) === dateStr
                    ).sort((a, b) => new Date(a.date) - new Date(b.date)) || [];
                    
                    // Get the attendance for this specific occurrence if it exists
                    const attendance = occurrence <= dateAttendances.length ? dateAttendances[occurrence - 1] : null;
                    
                    if (attendance) {
                        totalEntries++;
                        const status = attendance.status === 'Present' ? 'P' : 'A';
                        if (status === 'P') presentCount++;
                        row.push(status);
                    } else {
                        row.push(''); // No attendance entry for this occurrence
                    }
                });
                
                const percentage = totalEntries ? ((presentCount / totalEntries) * 100).toFixed(2) + '%' : '0%';
                row.push(percentage);
                data.push(row);
            });
        }

        // Generate Excel file
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Style the title cells and section headers
        const merges = [
            // Title row (Class, Subject, Batch)
            { s: { r: 0, c: 0 }, e: { r: 0, c: dateColumns.length + 2 } },
            // Regular Students header
            { s: { r: 2, c: 0 }, e: { r: 2, c: dateColumns.length + 2 } }
        ];
        
        // Find D2D header row if it exists
        for (let i = 4; i < data.length; i++) {
            if (data[i].length === 1 && data[i][0] === "D2D Students") {
                merges.push({ s: { r: i, c: 0 }, e: { r: i, c: dateColumns.length + 2 } });
                break;
            }
        }
        
        ws['!merges'] = merges;

        // Format date columns
        for (let i = 2; i < dateColumns.length + 2; i++) {
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
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${classInfo.sclassName}_${subjectInfo.subName}_${batchName ? batchName + '_' : ''}${new Date().toISOString().slice(0,10)}.xlsx`);
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
        const { adminId } = req.query; // Get adminId from query params

        // Get all students in class
        const students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ 
            sclassName: classId,
            ...(adminId && { school: adminId }) // Filter D2D students by school if adminId provided
        }).populate('attendance.subName');

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

        // Process each attendance record individually
        const results = [];
        for (const record of attendanceList) {
            const { studentId, isDtod, date, status, subName } = record;
            if (!studentId || !date || !status || !subName) {
                console.log('Skipping invalid record:', record);
                continue;
            }

            try {
                // Determine if student is D2D
                let isD2D = isDtod === true;
                if (typeof isD2D !== 'boolean') {
                    const dtodStudent = await DtodStudent.findById(studentId);
                    isD2D = !!dtodStudent;
                }

                // Get the student to check existing attendance
                const StudentModel = isD2D ? DtodStudent : Student;
                const student = await StudentModel.findById(studentId);
                
                if (!student) {
                    results.push({ studentId, success: false, error: 'Student not found' });
                    continue;
                }
                
                // Check for existing attendance on the same day for this subject
                const dateStr = new Date(date).toISOString().split('T')[0];
                const existingEntries = student.attendance.filter(a => 
                    a.subName.toString() === subName.toString() && 
                    new Date(a.date).toISOString().split('T')[0] === dateStr
                );
                
                // Add the new attendance record without removing existing ones
                await StudentModel.updateOne(
                    { _id: studentId },
                    { $push: { attendance: { date: new Date(date), status, subName } } }
                );

                results.push({ studentId, success: true });
            } catch (err) {
                console.error(`Error processing student ${studentId}:`, err);
                results.push({ studentId, success: false, error: err.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        res.json({ 
            message: `Attendance marked successfully for ${successCount} of ${attendanceList.length} students`,
            results
        });
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

        // Add the new attendance record without removing existing ones
        if (student.constructor.modelName === 'DtodStudent') {
            const pushRes = await DtodStudent.updateOne(
                { _id: student._id },
                { $push: { attendance: {
                    date: new Date(date),
                    status: mode === 'present' ? 'Present' : 'Absent',
                    subName: subjectId
                } } }
            );
            console.log('Quick attendance update for D2D:', student._id, { pushRes });
        } else {
            const pushRes = await Student.updateOne(
                { _id: student._id },
                { $push: { attendance: {
                    date: new Date(date),
                    status: mode === 'present' ? 'Present' : 'Absent',
                    subName: subjectId
                } } }
            );
            console.log('Quick attendance update for regular:', student._id, { pushRes });
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
            const operations = students.map(student => ({
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
            }));

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

/**
 * Send email alerts to students with attendance < 50%
 * POST /api/attendance/send-low-attendance-emails
 * Body: { classId }
 */
const sendLowAttendanceEmails = async (req, res) => {
    try {
        const { classId } = req.body;
        if (!classId) return res.status(400).json({ message: 'classId is required' });

        // Get all students in class
        const students = await Student.find({ sclassName: classId });
        const dtodStudents = await DtodStudent.find({ sclassName: classId });
        const subjects = await Subject.find({ sclassName: classId });

        // Setup nodemailer transporter (use your SMTP credentials)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // Collect students with low attendance
        const lowAttendanceStudents = [];
        const allStudents = [...students, ...dtodStudents];
        for (const student of allStudents) {
            const stats = calculateAttendanceStats(student, subjects);
            if (stats.overallPercentage < 50) {
                lowAttendanceStudents.push({
                    name: student.name,
                    email: student.email,
                    rollNum: student.rollNum,
                    percentage: stats.overallPercentage
                });
            }
        }

        // Send emails
        let sentCount = 0;
        for (const s of lowAttendanceStudents) {
            if (!s.email) continue;
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: s.email,
                    subject: 'Low Attendance Warning',
                    text: `Dear ${s.name} (Roll No: ${s.rollNum}),\n\nYour attendance is currently ${s.percentage}%. Please improve your attendance to avoid disciplinary action.\n\nRegards,\nClass Coordinator`
                });
                sentCount++;
            } catch (err) {
                // Log error but continue
                console.error('Email error for', s.email, err);
            }
        }

        res.json({
            message: `Emails sent to ${sentCount} students with attendance < 50%`,
            totalLow: lowAttendanceStudents.length
        });
    } catch (error) {
        console.error('Send low attendance emails error:', error);
        res.status(500).json({ message: 'Failed to send low attendance emails', error: error.message });
    }
};

/**
 * Count total lectures taken for a subject
 * This is determined by counting unique dates with attendance records
 */
const getLecturesCount = async (req, res) => {
    try {
        const { classId, subjectId } = req.params;
        
        if (!classId || !subjectId) {
            return res.status(400).json({ message: 'Class ID and Subject ID are required' });
        }

        // Get all students in the class
        const students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ sclassName: classId }).populate('attendance.subName');
        const allStudents = [...students, ...dtodStudents];
        
        if (allStudents.length === 0) {
            return res.json({ lectureCount: 0 });
        }

        // Get all unique date-occurrence combinations for this subject
        // Use a Map where key = date, value = Set of occurrence numbers
        const uniqueDates = new Set();
        
        // Process attendance records for all students
        allStudents.forEach(student => {
            if (!student.attendance || !Array.isArray(student.attendance)) return;
            
            // Filter attendance records for this subject
            const subjectAttendance = student.attendance.filter(att => {
                // Handle both populated and non-populated subName
                if (!att.subName) return false;
                
                const attSubjectId = typeof att.subName === 'object' 
                    ? att.subName._id?.toString() 
                    : att.subName.toString();
                
                return attSubjectId === subjectId;
            });
            
            // Add all unique dates
            subjectAttendance.forEach(att => {
                const dateStr = new Date(att.date).toISOString().slice(0, 10);
                uniqueDates.add(dateStr);
            });
        });
        
        // Log for debugging
        console.log(`Found ${uniqueDates.size} unique dates for subject ${subjectId} in class ${classId}`);
        console.log('Dates:', Array.from(uniqueDates));
        
        res.json({ 
            lectureCount: uniqueDates.size,
            dates: Array.from(uniqueDates)
        });
        
    } catch (error) {
        console.error('Error counting lectures:', error);
        res.status(500).json({ message: 'Failed to count lectures', error: error.message });
    }
};

/**
 * Get attendance percentages for a specific subject
 */
const getSubjectAttendance = async (req, res) => {
    try {
        const { classId, subjectId } = req.params;

        // Validate parameters
        if (!classId || !subjectId) {
            return res.status(400).json({ message: 'Class ID and Subject ID are required' });
        }

        // Get all students in class
        const students = await Student.find({ sclassName: classId });
        const dtodStudents = await DtodStudent.find({ sclassName: classId });
        const subject = await Subject.findById(subjectId);

        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        // Calculate attendance percentage for each student for this subject
        const calculateSubjectPercentage = (student) => {
            const subAttendance = student.attendance?.filter(att => 
                att.subName && att.subName.toString() === subjectId
            ) || [];
            
            if (subAttendance.length === 0) return 0;
            const present = subAttendance.filter(att => att.status === 'Present').length;
            return Math.round((present / subAttendance.length) * 100 * 10) / 10;
        };

        // Process both regular and D2D students
        const result = [
            ...students.map(student => ({
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum,
                type: 'Regular',
                percentage: calculateSubjectPercentage(student)
            })),
            ...dtodStudents.map(student => ({
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum,
                type: 'D2D',
                percentage: calculateSubjectPercentage(student)
            }))
        ];

        res.json({
            subject: subject.subName,
            students: result
        });

    } catch (error) {
        console.error('Error getting subject attendance:', error);
        res.status(500).json({ message: 'Failed to get subject attendance data' });
    }
};

module.exports = {
    downloadAttendanceExcel,
    downloadCoordinatorReport,
    getClassAttendance,
    bulkMarkAttendance,
    quickMarkAttendance,
    quickSubmitAttendance,
    sendLowAttendanceEmails,
    getLecturesCount,
    getSubjectAttendance
};
