require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { Parser } = require('json2csv');
const moment = require('moment');
const path = require('path');
const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://fieldforce-pro.vercel.app',
    process.env.FRONTEND_URL
  ],
  credentials: true
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in environment variables");
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Database Schemas
const employeeSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'employee' },
  hourlyRate: { type: Number, default: 25 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  employee_id: mongoose.ObjectId,
  title: String,
  description: String,
  customer_name: String,
  customer_phone: String,
  address: String,
  priority: { type: Number, default: 1 },
  due_date: Date,
  status: { type: String, default: 'pending' },
  estimated_hours: Number,
  actual_hours: Number,
  created_at: { type: Date, default: Date.now }
});

const locationSchema = new mongoose.Schema({
  employee_id: mongoose.ObjectId,
  latitude: Number,
  longitude: Number,
  accuracy: Number,
  battery_level: Number,
  timestamp: { type: Date, default: Date.now }
});

const emergencySchema = new mongoose.Schema({
  employee_id: mongoose.ObjectId,
  employee_name: String,
  emergency_type: String,
  location: { lat: Number, lng: Number },
  message: String,
  status: { type: String, default: 'active' },
  responded_by: mongoose.ObjectId,
  created_at: { type: Date, default: Date.now }
});

const logSchema = new mongoose.Schema({
  employee_id: mongoose.ObjectId,
  employee_name: String,
  action_type: String,
  description: String,
  task_id: mongoose.ObjectId,
  task_title: String,
  location: { lat: Number, lng: Number },
  timestamp: { type: Date, default: Date.now },
  ip_address: String,
  device_info: String,
  details: mongoose.Schema.Types.Mixed
});

// Models
const Employee = mongoose.model('Employee', employeeSchema);
const Task = mongoose.model('Task', taskSchema);
const Location = mongoose.model('Location', locationSchema);
const Emergency = mongoose.model('Emergency', emergencySchema);
const Log = mongoose.model('Log', logSchema);

// Logging Middleware
app.use(async (req, res, next) => {
  const originalSend = res.send;
  res.send = async function(data) {
    if (req.method !== 'GET' && !req.path.includes('/api/export')) {
      try {
        let employeeName = 'Unknown';
        if (req.body.employee_id) {
          const employee = await Employee.findById(req.body.employee_id);
          employeeName = employee?.name || 'Unknown';
        }

        const logData = {
          employee_id: req.body.employee_id,
          employee_name: employeeName,
          action_type: getActionType(req.path, req.method),
          description: getActionDescription(req.path, req.method, req.body),
          ip_address: req.ip || req.connection.remoteAddress,
          device_info: req.get('User-Agent') || 'Unknown',
          details: req.body
        };

        if (req.body.task_id) {
          logData.task_id = req.body.task_id;
          const task = await Task.findById(req.body.task_id);
          logData.task_title = task?.title;
        }

        if (req.body.latitude) {
          logData.location = { lat: req.body.latitude, lng: req.body.longitude };
        }

        await Log.create(logData);
      } catch (error) {
        console.error('Logging error:', error);
      }
    }
    originalSend.call(this, data);
  };
  next();
});

function getActionType(path, method) {
  const actions = {
    'POST:/api/login': 'user_login',
    'POST:/api/register': 'employee_registered',
    'POST:/api/tasks': 'task_created',
    'POST:/api/task-progress': 'task_updated',
    'POST:/api/location': 'location_logged',
    'POST:/api/emergency': 'emergency_triggered',
    'POST:/api/export': 'report_generated'
  };
  return actions[`${method}:${path}`] || 'system_action';
}

function getActionDescription(path, method, body) {
  const basePath = `${method}:${path}`;
  switch(basePath) {
    case 'POST:/api/login': return `User logged in: ${body.email}`;
    case 'POST:/api/register': return `New employee registered: ${body.name}`;
    case 'POST:/api/tasks': return `Task created: ${body.title}`;
    case 'POST:/api/task-progress': return `Task ${body.action}: ${body.task_id}`;
    case 'POST:/api/location': return `Location updated: ${body.latitude}, ${body.longitude}`;
    case 'POST:/api/emergency': return `Emergency: ${body.emergency_type} - ${body.message}`;
    default: return `Action performed: ${basePath}`;
  }
}

// ==================== EMPLOYEE ROUTES ====================
app.post('/api/register', async (req, res) => {
  try {
    const employee = await Employee.create(req.body);
    res.json({ id: employee._id, message: 'Employee registered successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const employee = await Employee.findOne({ email, password, isActive: true });
    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials or inactive account' });
    }
    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== TASK ROUTES ====================
app.post('/api/tasks', async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.json({ id: task._id, message: 'Task created successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/tasks/:employee_id', async (req, res) => {
  try {
    const tasks = await Task.find({ employee_id: req.params.employee_id })
      .sort({ priority: -1, due_date: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== AI PRIORITY ROUTE ====================
app.get('/api/prioritized-tasks/:employee_id', async (req, res) => {
  try {
    const tasks = await Task.aggregate([
      { 
        $match: { 
          employee_id: new mongoose.Types.ObjectId(req.params.employee_id), 
          status: 'pending' 
        } 
      },
      { 
        $addFields: {
          days_until_due: { 
            $divide: [
              { $subtract: ['$due_date', new Date()] }, 
              1000 * 60 * 60 * 24
            ] 
          },
          ai_score: {
            $switch: {
              branches: [
                { 
                  case: { $lt: [{ $subtract: ['$due_date', new Date()] }, 0] }, 
                  then: 1000
                },
                { 
                  case: { $lt: [{ $subtract: ['$due_date', new Date()] }, 86400000] }, 
                  then: 900
                },
                { 
                  case: { $eq: ['$priority', 3] }, 
                  then: 800 + Math.random() * 50
                },
                { 
                  case: { $eq: ['$priority', 2] }, 
                  then: 600 + Math.random() * 50
                }
              ],
              default: { 
                $add: [400, { $multiply: [{ $rand: {} }, 50] }]
              }
            }
          }
        }
      },
      { $sort: { ai_score: -1 } },
      { $limit: 5 }
    ]);
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== LOCATION ROUTES ====================
app.post('/api/location', async (req, res) => {
  try {
    const location = await Location.create(req.body);
    res.json({ id: location._id, message: 'Location logged successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/location/:employee_id', async (req, res) => {
  try {
    const locations = await Location.find({ employee_id: req.params.employee_id })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(locations);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== EMERGENCY ROUTES ====================
app.post('/api/emergency', async (req, res) => {
  try {
    const emergency = await Emergency.create(req.body);
    
    // Log emergency for response tracking
    await Log.create({
      employee_id: req.body.employee_id,
      employee_name: req.body.employee_name,
      action_type: 'emergency_triggered',
      description: `EMERGENCY: ${req.body.emergency_type} - ${req.body.message}`,
      location: req.body.location,
      details: req.body
    });
    
    res.json({ 
      success: true, 
      message: 'Emergency alert sent! Help is on the way.',
      emergency 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emergency-contacts', (req, res) => {
  res.json([
    { name: "Safety Manager", phone: "+1234567890", role: "Primary Safety Contact" },
    { name: "Medical Emergency", phone: "911", role: "Emergency Services" },
    { name: "Team Lead", phone: "+1234567891", role: "Immediate Supervisor" },
    { name: "HR Department", phone: "+1234567892", role: "Human Resources" }
  ]);
});

// ==================== BENEFITS ROUTES ====================
app.get('/api/mileage/:employee_id', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const locations = await Location.find({
      employee_id: req.params.employee_id,
      timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ timestamp: 1 });

    let totalMiles = 0;
    for (let i = 1; i < locations.length; i++) {
      const dist = calculateDistance(
        { lat: locations[i-1].latitude, lng: locations[i-1].longitude },
        { lat: locations[i].latitude, lng: locations[i].longitude }
      );
      totalMiles += dist;
    }

    const reimbursement = (totalMiles * 0.67).toFixed(2); // Current IRS rate
    
    res.json({
      totalMiles: totalMiles.toFixed(2),
      reimbursement: `$${reimbursement}`,
      period: `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
      message: `You've earned $${reimbursement} in mileage reimbursement!`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/timesheet/:employee_id', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const tasks = await Task.find({ 
      employee_id: req.params.employee_id,
      status: 'completed',
      created_at: { $gte: new Date(startDate), $lte: new Date(endDate) }
    });
    
    const employee = await Employee.findById(req.params.employee_id);
    const hourlyRate = employee?.hourlyRate || 25;
    
    const totalHours = tasks.reduce((sum, task) => sum + (task.actual_hours || 0), 0);
    const overtime = Math.max(0, totalHours - 40);
    const regularHours = Math.min(totalHours, 40);
    
    res.json({
      totalHours: totalHours.toFixed(1),
      regularHours: regularHours.toFixed(1),
      overtime: overtime.toFixed(1),
      regularPay: `$${(regularHours * hourlyRate).toFixed(2)}`,
      overtimePay: `$${(overtime * hourlyRate * 1.5).toFixed(2)}`,
      totalPay: `$${((regularHours * hourlyRate) + (overtime * hourlyRate * 1.5)).toFixed(2)}`,
      period: `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/time-savings/:employee_id', async (req, res) => {
  try {
    const tasks = await Task.find({ 
      employee_id: req.params.employee_id,
      status: 'completed'
    });
    
    const estimatedTime = tasks.reduce((sum, task) => sum + (task.estimated_hours || 1), 0);
    const actualTime = tasks.reduce((sum, task) => sum + (task.actual_hours || 0), 0);
    const timeSaved = Math.max(0, estimatedTime - actualTime);
    
    res.json({
      timeSaved: timeSaved.toFixed(1),
      efficiency: actualTime > 0 ? ((estimatedTime / actualTime) * 100).toFixed(1) : '0',
      message: timeSaved > 0 ? 
        `You saved ${timeSaved} hours thanks to optimized routing!` :
        'Keep tracking for time savings insights!',
      tip: 'AI routing helps you finish faster and earn more'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROGRESS TRACKING ====================
app.post('/api/task-progress', async (req, res) => {
  try {
    const { task_id, employee_id, action, notes, location_lat, location_lng, actual_hours } = req.body;
    
    await Task.findByIdAndUpdate(task_id, { 
      status: action,
      actual_hours: actual_hours || 0
    });
    
    res.json({ message: 'Task progress updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== WEEKLY EXPORT & CLEANUP ====================
app.get('/api/export/weekly-report', async (req, res) => {
  try {
    const { week_start, week_end } = req.query;
    
    const startDate = new Date(week_start);
    const endDate = new Date(week_end);
    endDate.setHours(23, 59, 59, 999);

    const [tasks, locations, logs, employees, emergencies] = await Promise.all([
      Task.find({ created_at: { $gte: startDate, $lte: endDate } }),
      Location.find({ timestamp: { $gte: startDate, $lte: endDate } }),
      Log.find({ timestamp: { $gte: startDate, $lte: endDate } }),
      Employee.find({ isActive: true }),
      Emergency.find({ created_at: { $gte: startDate, $lte: endDate } })
    ]);

    // Generate CSV files
    const tasksCsv = await generateCsv(tasks, 'tasks');
    const locationsCsv = await generateCsv(locations, 'locations');
    const logsCsv = await generateCsv(logs, 'logs');
    const employeesCsv = await generateCsv(employees, 'employees');
    const emergenciesCsv = await generateCsv(emergencies, 'emergencies');

    // Weekly report summary
    const weeklyReport = {
      week_number: `Week-${moment(startDate).format('WW-YYYY')}`,
      week_start: startDate,
      week_end: endDate,
      total_employees: employees.length,
      total_tasks: tasks.length,
      completed_tasks: tasks.filter(t => t.status === 'completed').length,
      total_locations: locations.length,
      total_logs: logs.length,
      emergencies: emergencies.length,
      total_mileage: await calculateTotalMileage(locations),
      generated_at: new Date()
    };

    const reportCsv = await generateCsv([weeklyReport], 'weekly_summary');

    res.json({
      weekly_report: weeklyReport,
      files: {
        tasks: tasksCsv,
        locations: locationsCsv,
        logs: logsCsv,
        employees: employeesCsv,
        emergencies: emergenciesCsv,
        summary: reportCsv
      },
      message: 'Weekly report generated successfully'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleanup/weekly-data', async (req, res) => {
  try {
    const { week_start, week_end, backup_confirmed } = req.body;
    
    if (!backup_confirmed) {
      return res.status(400).json({ error: 'Backup confirmation required' });
    }

    const startDate = new Date(week_start);
    const endDate = new Date(week_end);
    endDate.setHours(23, 59, 59, 999);

    const deleteResults = await Promise.all([
      Task.deleteMany({ 
        created_at: { $gte: startDate, $lte: endDate },
        status: 'completed'
      }),
      Location.deleteMany({ 
        timestamp: { $gte: startDate, $lte: endDate }
      }),
      Log.deleteMany({ 
        timestamp: { $gte: startDate, $lte: endDate }
      })
    ]);

    res.json({
      message: 'Weekly data cleanup completed',
      deleted: {
        tasks: deleteResults[0].deletedCount,
        locations: deleteResults[1].deletedCount,
        logs: deleteResults[2].deletedCount
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/logs', async (req, res) => {
  try {
    const { page = 1, limit = 100, employee_id, action_type } = req.query;
    const filter = {};
    if (employee_id) filter.employee_id = employee_id;
    if (action_type) filter.action_type = action_type;

    const logs = await Log.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Log.countDocuments(filter);

    res.json({ logs, totalPages: Math.ceil(total / limit), currentPage: page, total });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== UTILITY FUNCTIONS ====================
function calculateDistance(loc1, loc2) {
  const R = 6371; // Earth's radius in km
  const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
  const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  return distanceKm * 0.621371; // Convert to miles
}

async function calculateTotalMileage(locations) {
  let totalMiles = 0;
  for (let i = 1; i < locations.length; i++) {
    const dist = calculateDistance(
      { lat: locations[i-1].latitude, lng: locations[i-1].longitude },
      { lat: locations[i].latitude, lng: locations[i].longitude }
    );
    totalMiles += dist;
  }
  return totalMiles.toFixed(2);
}

async function generateCsv(data, type) {
  try {
    let fields = [];
    
    switch(type) {
      case 'tasks':
        fields = ['_id', 'title', 'customer_name', 'customer_phone', 'address', 'priority', 'due_date', 'status', 'estimated_hours', 'actual_hours', 'created_at'];
        break;
      case 'locations':
        fields = ['_id', 'employee_id', 'latitude', 'longitude', 'timestamp'];
        break;
      case 'logs':
        fields = ['_id', 'employee_name', 'action_type', 'description', 'timestamp', 'ip_address'];
        break;
      case 'employees':
        fields = ['_id', 'name', 'email', 'role', 'hourlyRate', 'createdAt'];
        break;
      case 'emergencies':
        fields = ['_id', 'employee_name', 'emergency_type', 'message', 'status', 'created_at'];
        break;
      case 'weekly_summary':
        fields = ['week_number', 'total_employees', 'total_tasks', 'completed_tasks', 'total_locations', 'total_logs', 'emergencies', 'total_mileage'];
        break;
    }

    const parser = new Parser({ fields });
    return parser.parse(data);
  } catch (error) {
    throw new Error(`CSV generation failed: ${error.message}`);
  }
}

// Serve frontend
app.get('/ping', (req, res) => {
  res.send('Backend OK ✅');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FieldForce Pro running on port ${PORT}`);
});

