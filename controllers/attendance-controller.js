const Student = require('../models/studentSchema');
const DtodStudent = require('../models/dtodStudentSchema');
const Sclass = require('../models/sclassSchema');
const Subject = require('../models/subjectSchema');
const XLSX = require('xlsx');

const downloadAttendanceExcel = async (req, res) => {

    try {
        const { classId, subjectId } = req.params;
        const { batch: batchName } = req.query;

        // Get all students in class
        let students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        let dtodStudents = await DtodStudent.find({ sclassName: classId, school: req.query.adminId }).populate('attendance.subName');

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

        // Create Excel data
        const headers = ['Roll No', 'Name', ...dates.map(d => new Date(d).toLocaleDateString()), '% Attendance'];
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
            if (batchName && subjectInfo.isLab && batchStudentIds.length > 0 && !batchStudentIds.includes(student._id.toString())) {
                // Not in batch: leave attendance cells blank
                const row = [student.rollNum, student.name + ' (D2D)', ...Array(dates.length).fill(''), ''];
                data.push(row);
                return;
            }
            const row = [student.rollNum, student.name + ' (D2D)'];
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

        // Generate Excel file
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Style the title cells
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: dates.length + 2 } }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Excel generation error:', error);
        res.status(500).json({ message: 'Failed to generate attendance report' });
    }
};

const downloadCoordinatorReport = async (req, res) => {
    try {
        console.log('Starting report generation for classId:', req.params.classId);
        const { classId } = req.params;
        const { type } = req.query;

        // Set CORS headers early
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (!classId) {
            console.error('Missing classId in request');
            return res.status(400).json({ message: 'Class ID is required' });
        }

        console.log('Fetching data for class:', classId);
        // Get all students and subjects for the class with proper population
        const [students, dtodStudents, subjects, classInfo] = await Promise.all([
            Student.find({ sclassName: classId }).populate('attendance.subName').lean(),
            DtodStudent.find({ sclassName: classId }).populate('attendance.subName').lean(),
            Subject.find({ sclassName: classId }).lean(),
            Sclass.findById(classId).lean()
        ]);

        if (!classInfo) {
            return res.status(404).json({ message: 'Class not found' });
        }

        if (!subjects || subjects.length === 0) {
            return res.status(404).json({ message: 'No subjects found for this class' });
        }

        // Create headers with proper formatting
        const headers = ['Roll No', 'Name', ...subjects.map(sub => sub.subName), 'Overall %'];
        const data = [
            [`Class: ${classInfo.sclassName}`, `Report Generated on: ${new Date().toLocaleDateString()}`],
            [`Total Subjects: ${subjects.length}`, `Total Students: ${students.length + dtodStudents.length}`],
            [],  // Empty row for spacing
            headers
        ];

        // Process all students (both regular and D2D)
        const processStudent = (student, isDtod = false) => {
            const row = [student.rollNum, `${student.name}${isDtod ? ' (D2D)' : ''}`];
            let totalPresent = 0;
            let totalClasses = 0;

            // Calculate subject-wise attendance
            const subjectAttendances = subjects.map(subject => {
                const subAttendance = student.attendance?.filter(att => 
                    att.subName && att.subName._id.toString() === subject._id.toString()
                ) || [];
                
                const present = subAttendance.filter(att => att.status === 'Present').length;
                const total = subAttendance.length;
                
                totalPresent += present;
                totalClasses += total;
                
                const percentage = total === 0 ? 0 : (present / total) * 100;
                return `${percentage.toFixed(1)}%`;
            });

            // Calculate and format overall percentage
            const overallPercentage = totalClasses === 0 ? 0 : (totalPresent / totalClasses) * 100;
            row.push(...subjectAttendances, `${overallPercentage.toFixed(1)}%`);
            return row;
        };

        // Add all students to data array
        [...students.map(s => processStudent(s)), ...dtodStudents.map(s => processStudent(s, true))]
            .sort((a, b) => a[0].localeCompare(b[0])) // Sort by roll number
            .forEach(row => data.push(row));

        // Add summary row
        const summaryRow = ['', 'Class Average'];
        for (let i = 2; i < headers.length; i++) {
            const column = data.slice(4).map(row => parseFloat(row[i])); // Skip headers and get percentages
            const average = column.reduce((a, b) => a + b, 0) / column.length;
            summaryRow.push(`${average.toFixed(1)}%`);
        }
        data.push([], summaryRow); // Add empty row before summary

        // Generate Excel file with styling
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Enhanced styling
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: subjects.length + 2 } }, // Title row
            { s: { r: 1, c: 0 }, e: { r: 1, c: subjects.length + 2 } }  // Info row
        ];

        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, // Roll No
            { wch: 25 }, // Name
            ...subjects.map(() => ({ wch: 15 })), // Subject columns
            { wch: 15 }  // Overall column
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for proper file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        return res.send(buffer);

    } catch (error) {
        console.error('Report generation error:', error);
        return res.status(500).json({ 
            message: 'Failed to generate attendance report',
            error: error.message || 'Unknown error'
        });
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

        // Calculate attendance percentages for each student across all subjects
        const processStudentAttendance = (student) => {
            const subjectPercentages = subjects.map(subject => {
                const subjectAttendance = student.attendance?.filter(att => 
                    att.subName && att.subName._id.toString() === subject._id.toString()
                );
                
                if (!subjectAttendance || subjectAttendance.length === 0) return 0;

                const presentCount = subjectAttendance.filter(att => att.status === 'Present').length;
                return (presentCount / subjectAttendance.length) * 100;
            });

            // Calculate overall percentage across all subjects
            const overallPercentage = subjectPercentages.length > 0
                ? (subjectPercentages.reduce((a, b) => a + b, 0) / subjectPercentages.length)
                : 0;

            return {
                _id: student._id,
                name: student.name,
                rollNum: student.rollNum,
                type: student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular',
                attendance: {
                    overallPercentage: Math.round(overallPercentage * 10) / 10,
                    subjectWise: subjects.map((subject, index) => ({
                        subject: subject.subName,
                        percentage: Math.round(subjectPercentages[index] * 10) / 10
                    }))
                }
            };
        };

        // Process both regular and D2D students
        const allStudents = [
            ...students.map(processStudentAttendance),
            ...dtodStudents.map(processStudentAttendance)
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
        console.error('Attendance calculation error:', error);
        res.status(500).json({ message: 'Failed to calculate attendance statistics' });
    }
};

module.exports = {
    downloadAttendanceExcel,
    downloadCoordinatorReport,
    getClassAttendance
};
