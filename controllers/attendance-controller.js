const Student = require('../models/studentSchema');
const DtodStudent = require('../models/dtodStudentSchema');
const Sclass = require('../models/sclassSchema');
const Subject = require('../models/subjectSchema');
const XLSX = require('xlsx');

const downloadAttendanceExcel = async (req, res) => {
    try {
        const { classId, subjectId } = req.params;
        const batchIdx = req.query.batchIdx !== undefined ? parseInt(req.query.batchIdx) : undefined;

        // Get students and validate class/subject
        const students = await Student.find({ sclassName: classId })
            .populate('attendance.subName');
        const dtodStudents = await DtodStudent.find({ sclassName: classId, school: req.query.adminId })
            .populate('attendance.subName');

        const classInfo = await Sclass.findById(classId);
        const subjectInfo = await Subject.findById(subjectId);

        if (!classInfo || !subjectInfo) {
            return res.status(404).json({ message: 'Class or subject not found' });
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

        // If lab subject and batchIdx is provided, get allowed student IDs
        let allowedStudentIds = null;
        if (subjectInfo.isLab && Array.isArray(subjectInfo.batches) && subjectInfo.batches.length > 0 && batchIdx !== undefined && subjectInfo.batches[batchIdx]) {
            allowedStudentIds = subjectInfo.batches[batchIdx].students.map(id => id.toString());
        }

        // Add regular student rows
        students.forEach(student => {
            const row = [student.rollNum, student.name];
            let presentCount = 0;

            // If lab and not in allowed batch, mark all blank
            if (allowedStudentIds && !allowedStudentIds.includes(student._id.toString())) {
                for (let i = 0; i < dates.length; i++) row.push('');
                row.push('');
                data.push(row);
                return;
            }

            dates.forEach(date => {
                const attendance = student.attendance?.find(a => 
                    a.subName && 
                    a.subName._id.toString() === subjectId &&
                    new Date(a.date).toISOString().slice(0, 10) === date
                );
                const status = attendance?.status === 'Present' ? 'P' : 'A';
                if (status === 'P') presentCount++;
                row.push(status);
            });

            const percentage = dates.length ? ((presentCount / dates.length) * 100).toFixed(2) + '%' : '0%';
            row.push(percentage);
            data.push(row);
        });

        // Add D2D student rows
        dtodStudents.forEach(student => {
            const row = [student.rollNum, student.name + ' (D2D)'];
            let presentCount = 0;

            // If lab and not in allowed batch, mark all blank
            if (allowedStudentIds && !allowedStudentIds.includes(student._id.toString())) {
                for (let i = 0; i < dates.length; i++) row.push('');
                row.push('');
                data.push(row);
                return;
            }

            dates.forEach(date => {
                const attendance = student.attendance?.find(a => 
                    a.subName && 
                    a.subName._id.toString() === subjectId &&
                    new Date(a.date).toISOString().slice(0, 10) === date
                );
                const status = attendance?.status === 'Present' ? 'P' : 'A';
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

module.exports = {
    downloadAttendanceExcel
};
