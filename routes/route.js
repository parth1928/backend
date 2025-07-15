const router = require('express').Router();
const multer = require('multer');
const upload = multer();

const { 
    coordinatorRegister, 
    coordinatorLogin, 
    getClassDetails, 
    getStudentsAttendance, 
    downloadAttendanceReport,
    getCoordinatorDetail 
} = require('../controllers/coordinator-controller.js');

// const { adminRegister, adminLogIn, deleteAdmin, getAdminDetail, updateAdmin } = require('../controllers/admin-controller.js');

const { adminRegister, adminLogIn, getAdminDetail} = require('../controllers/admin-controller.js');

const { sclassCreate, sclassList, deleteSclass, deleteSclasses, getSclassDetail, getSclassStudents } = require('../controllers/class-controller.js');
const { complainCreate, complainList } = require('../controllers/complain-controller.js');
const { noticeCreate, noticeList, deleteNotices, deleteNotice, updateNotice } = require('../controllers/notice-controller.js');
const {
    studentRegister,
    studentLogIn,
    getStudents,
    getStudentDetail,
    deleteStudents,
    deleteStudent,
    updateStudent,
    studentAttendance,
    deleteStudentsByClass,
    updateExamResult,
    clearAllStudentsAttendanceBySubject,
    clearAllStudentsAttendance,
    removeStudentAttendanceBySubject,
    removeStudentAttendance,
    bulkRegisterStudents
} = require('../controllers/student_controller.js');
// Bulk register regular students
router.post('/Students/BulkRegister', bulkRegisterStudents);
const { subjectCreate, classSubjects, deleteSubjectsByClass, getSubjectDetail, deleteSubject, freeSubjectList, allSubjects, deleteSubjects } = require('../controllers/subject-controller.js');
const { updateSubjectBatches } = require('../controllers/batch-controller.js');
const { teacherRegister, teacherLogIn, getTeachers, getTeacherDetail, deleteTeachers, deleteTeachersByClass, deleteTeacher, updateTeacherSubject, teacherAttendance } = require('../controllers/teacher-controller.js');
const { downloadAttendanceExcel, getClassAttendance, downloadCoordinatorReport } = require('../controllers/attendance-controller.js');
const { quickMarkAttendance, submitQuickAttendance } = require('../controllers/quickAttendance-controller.js');
const { bulkUploadDtodStudents, deleteDtodStudent, getDtodStudentDetail, getAllDtodStudents } = require('../controllers/dtodStudent-controller');
const { getCoordinatorsList } = require('../controllers/coordinator-list-controller.js');

// Attendance routes
// Download attendance Excel. Optional query param: ?batch=BatchName
// Attendance download routes
router.get('/attendance/download/:classId/:subjectId', downloadAttendanceExcel);
router.get('/attendance/coordinator-report/:classId', downloadCoordinatorReport);
router.get('/class-attendance/:classId', getClassAttendance);

// Add OPTIONS route to handle preflight requests
router.options('/attendance/coordinator-report/:classId', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    res.header('Access-Control-Expose-Headers', 'Content-Disposition');
    res.sendStatus(200);
});

// Admin
router.post('/AdminReg', adminRegister);
router.post('/AdminLogin', adminLogIn);

// Coordinator
router.post('/ClassCoordinatorCreate', coordinatorRegister); // Add this line
router.get('/ClassCoordinators/:adminId', getCoordinatorsList);
router.post('/CoordinatorReg', coordinatorRegister);
router.post('/CoordinatorLogin', coordinatorLogin);
router.get('/Coordinator/class/:id', getClassDetails);
router.get('/Coordinator/attendance/:id', getStudentsAttendance);
router.get('/Coordinator/attendance/download/:id', downloadCoordinatorReport);
// Added for consistency with frontend
router.get('/coordinator/class/:id', getClassDetails);
router.get('/coordinator/students/:classId', getStudents);
router.get('/coordinator/attendance/:classId', getStudentsAttendance);
router.get('/coordinator/attendance/analysis/:classId', getStudentsAttendance);
router.get('/coordinator/attendance/report/:classId', getStudentsAttendance);
router.get('/coordinator/attendance/download/:classId', downloadCoordinatorReport);
router.get('/coordinator/profile/:id', getCoordinatorDetail);

router.get("/Admin/:id", getAdminDetail)
// router.delete("/Admin/:id", deleteAdmin)

// router.put("/Admin/:id", updateAdmin)

// Student

router.post('/StudentReg', studentRegister);
router.post('/StudentLogin', studentLogIn)

router.get("/Students/:id", getStudents)
router.get("/Student/:id", getStudentDetail)

router.delete("/Students/:id", deleteStudents)
router.delete("/StudentsClass/:id", deleteStudentsByClass)
router.delete("/Student/:id", deleteStudent)

router.put("/Student/:id", updateStudent)

router.put('/UpdateExamResult/:id', updateExamResult)

router.put('/StudentAttendance/:id', studentAttendance)

router.put('/RemoveAllStudentsSubAtten/:id', clearAllStudentsAttendanceBySubject);
router.put('/RemoveAllStudentsAtten/:id', clearAllStudentsAttendance);

router.put('/RemoveStudentSubAtten/:id', removeStudentAttendanceBySubject);
router.put('/RemoveStudentAtten/:id', removeStudentAttendance)

// Teacher

router.post('/TeacherReg', teacherRegister);
router.post('/TeacherLogin', teacherLogIn)

router.get("/Teachers/:id", getTeachers)
router.get("/Teacher/:id", getTeacherDetail)

router.delete("/Teachers/:id", deleteTeachers)
router.delete("/TeachersClass/:id", deleteTeachersByClass)
router.delete("/Teacher/:id", deleteTeacher)

router.put("/TeacherSubject", updateTeacherSubject)

router.post('/TeacherAttendance/:id', teacherAttendance)

// Notice

router.post('/NoticeCreate', noticeCreate);

router.get('/NoticeList/:id', noticeList);

router.delete("/Notices/:id", deleteNotices)
router.delete("/Notice/:id", deleteNotice)

router.put("/Notice/:id", updateNotice)

// Complain

router.post('/ComplainCreate', complainCreate);

router.get('/ComplainList/:id', complainList);

// Sclass

router.post('/SclassCreate', sclassCreate);

router.get('/SclassList/:id', sclassList);
router.get("/Sclass/:id", getSclassDetail)

router.get("/Sclass/Students/:id", getSclassStudents)

router.delete("/Sclasses/:id", deleteSclasses)
router.delete("/Sclass/:id", deleteSclass)


// Subject
router.post('/SubjectCreate', subjectCreate);
router.put('/Subject/:subjectId/batches', updateSubjectBatches); // <-- New route for batch assignment
router.get('/AllSubjects/:id', allSubjects);
router.get('/ClassSubjects/:id', classSubjects);
router.get('/FreeSubjectList/:id', freeSubjectList);
router.get("/Subject/:id", getSubjectDetail)
router.delete("/Subject/:id", deleteSubject)
router.delete("/Subjects/:id", deleteSubjects)
router.delete("/SubjectsClass/:id", deleteSubjectsByClass)

// Attendance routes
router.get('/attendance-excel/:classId/:subjectId', downloadAttendanceExcel);
router.get('/attendance/download/:classId/:subjectId', downloadAttendanceExcel);

// Quick Attendance routes
router.post('/attendance/quick-mark', quickMarkAttendance);
router.post('/attendance/quick-submit', submitQuickAttendance);

// D2D Students

router.post('/DtodStudentsUpload', upload.single('file'), bulkUploadDtodStudents);
router.delete('/dtod_students/:id', deleteDtodStudent);
router.get('/dtod_students/:id', getDtodStudentDetail);
router.get('/dtod_students', getAllDtodStudents);

module.exports = router;