const Coordinator = require('../models/coordinatorSchema');

const getCoordinatorsList = async (req, res) => {
    try {
        const coordinators = await Coordinator.find({ school: req.params.adminId })
            .populate('assignedClass', 'sclassName');
        res.json(coordinators);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching coordinators" });
    }
};

module.exports = {
    getCoordinatorsList
};
