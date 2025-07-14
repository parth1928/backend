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
        const { classId } = req.params;
        const { type, startDate, endDate } = req.query;

        // Get all students and subjects for the class
        const students = await Student.find({ sclassName: classId }).populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ sclassName: classId }).populate('attendance.subName');
        const subjects = await Subject.find({ sclassName: classId });
        const classInfo = await Sclass.findById(classId);

        // Create workbook and add headers
        const wb = XLSX.utils.book_new();
        const headers = ['Roll No', 'Name', 'Type'];

        let data = [];
        let sheetName = '';

        switch(type) {
            case 'overall':
                // Add subject headers
                subjects.forEach(subject => {
                    headers.push(subject.subName);
                });
                headers.push('Overall %');

                // Add data rows
                data = [
                    [`Class: ${classInfo.sclassName}`, `Report Type: Overall Attendance`],
                    [],  // Empty row for spacing
                    headers
                ];

                // Process students
                [...students, ...dtodStudents].forEach(student => {
                    const row = [
                        student.rollNum,
                        student.name,
                        student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular'
                    ];

                    // Add subject-wise attendance
                    const subjectAttendance = subjects.map(subject => {
                        const attendance = student.attendance?.filter(a => 
                            a.subName && a.subName._id.toString() === subject._id.toString()
                        );
                        if (!attendance || attendance.length === 0) return '0%';
                        const present = attendance.filter(a => a.status === 'Present').length;
                        return `${Math.round((present / attendance.length) * 100)}%`;
                    });

                    row.push(...subjectAttendance);

                    // Calculate overall percentage
                    const overallPresent = student.attendance?.filter(a => a.status === 'Present').length || 0;
                    const overallTotal = student.attendance?.length || 0;
                    const overallPercentage = overallTotal ? Math.round((overallPresent / overallTotal) * 100) : 0;
                    row.push(`${overallPercentage}%`);

                    data.push(row);
                });

                sheetName = 'Overall Attendance';
                break;

            case 'monthly':
                // Get all months from attendance records
                const months = new Set();
                [...students, ...dtodStudents].forEach(student => {
                    student.attendance?.forEach(att => {
                        const month = new Date(att.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                        months.add(month);
                    });
                });

                // Add month headers
                headers.push(...Array.from(months));

                data = [
                    [`Class: ${classInfo.sclassName}`, `Report Type: Monthly Attendance`],
                    [],  // Empty row for spacing
                    headers
                ];

                // Process students
                [...students, ...dtodStudents].forEach(student => {
                    const row = [
                        student.rollNum,
                        student.name,
                        student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular'
                    ];

                    // Calculate attendance for each month
                    Array.from(months).forEach(month => {
                        const monthAttendance = student.attendance?.filter(att => {
                            const attMonth = new Date(att.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                            return attMonth === month;
                        });
                        const present = monthAttendance?.filter(a => a.status === 'Present').length || 0;
                        const total = monthAttendance?.length || 0;
                        row.push(total ? `${Math.round((present / total) * 100)}%` : 'N/A');
                    });

                    data.push(row);
                });

                sheetName = 'Monthly Attendance';
                break;

            case 'date-range':
                if (!startDate || !endDate) {
                    return res.status(400).json({ message: 'Start and end dates are required for date range report' });
                }

                const start = new Date(startDate);
                const end = new Date(endDate);

                // Add subject headers for date range
                subjects.forEach(subject => {
                    headers.push(subject.subName);
                });
                headers.push('Overall %');

                data = [
                    [`Class: ${classInfo.sclassName}`, `Report Type: Date Range (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`],
                    [],  // Empty row for spacing
                    headers
                ];

                // Process students for date range
                [...students, ...dtodStudents].forEach(student => {
                    const row = [
                        student.rollNum,
                        student.name,
                        student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular'
                    ];

                    // Add subject-wise attendance for date range
                    const subjectAttendance = subjects.map(subject => {
                        const attendance = student.attendance?.filter(a => 
                            a.subName && 
                            a.subName._id.toString() === subject._id.toString() &&
                            new Date(a.date) >= start &&
                            new Date(a.date) <= end
                        );
                        if (!attendance || attendance.length === 0) return '0%';
                        const present = attendance.filter(a => a.status === 'Present').length;
                        return `${Math.round((present / attendance.length) * 100)}%`;
                    });

                    row.push(...subjectAttendance);

                    // Calculate overall percentage for date range
                    const rangeAttendance = student.attendance?.filter(a => 
                        new Date(a.date) >= start &&
                        new Date(a.date) <= end
                    );
                    const present = rangeAttendance?.filter(a => a.status === 'Present').length || 0;
                    const total = rangeAttendance?.length || 0;
                    row.push(total ? `${Math.round((present / total) * 100)}%` : '0%');

                    data.push(row);
                });

                sheetName = 'Date Range Attendance';
                break;

            case 'subject-wise':
                // Add date headers
                const allDates = new Set();
                [...students, ...dtodStudents].forEach(student => {
                    student.attendance?.forEach(att => {
                        allDates.add(new Date(att.date).toLocaleDateString());
                    });
                });
                headers.push(...Array.from(allDates), 'Overall %');

                subjects.forEach(subject => {
                    const subjectData = [
                        [`Class: ${classInfo.sclassName}`, `Subject: ${subject.subName}`],
                        [],  // Empty row for spacing
                        headers
                    ];

                    [...students, ...dtodStudents].forEach(student => {
                        const row = [
                            student.rollNum,
                            student.name,
                            student.constructor.modelName === 'DtodStudent' ? 'D2D' : 'Regular'
                        ];

                        // Add attendance for each date
                        let presentCount = 0;
                        let totalCount = 0;
                        Array.from(allDates).forEach(date => {
                            const attendance = student.attendance?.find(a => 
                                a.subName && 
                                a.subName._id.toString() === subject._id.toString() &&
                                new Date(a.date).toLocaleDateString() === date
                            );
                            if (attendance) {
                                totalCount++;
                                if (attendance.status === 'Present') presentCount++;
                                row.push(attendance.status === 'Present' ? 'P' : 'A');
                            } else {
                                row.push('-');
                            }
                        });

                        // Add overall percentage for this subject
                        row.push(totalCount ? `${Math.round((presentCount / totalCount) * 100)}%` : '0%');
                        subjectData.push(row);
                    });

                    const ws = XLSX.utils.aoa_to_sheet(subjectData);
                    XLSX.utils.book_append_sheet(wb, ws, subject.subName.slice(0, 31)); // Excel sheet names limited to 31 chars
                });

                // Send the workbook without creating another sheet
                const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
                return res.send(buffer);
        }

        // Create worksheet and add to workbook (for non-subject-wise reports)
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Generate and send the file
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${classInfo.sclassName}_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Report generation error:', error);
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
