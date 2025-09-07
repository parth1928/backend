const Teacher = require('../models/teacherSchema.js');

const updateTeacherClasses = async (req, res) => {
    const { teacherId, teachClasses } = req.body;
    try {
        // Initialize teachClasses array if not already done
        const updatedTeacher = await Teacher.findByIdAndUpdate(
            teacherId,
            { 
                teachClasses: teachClasses,
                // Also update the primary class for backward compatibility
                teachSclass: teachClasses.length > 0 ? teachClasses[0] : null
            },
            { new: true }
        );

        if (!updatedTeacher) {
            return res.status(404).json({ message: "Teacher not found" });
        }

        res.send(updatedTeacher);
    } catch (error) {
        console.error('Error updating teacher classes:', error);
        res.status(500).json({ message: 'Error updating teacher classes', error: error.message });
    }
};

module.exports = {
    updateTeacherClasses
};