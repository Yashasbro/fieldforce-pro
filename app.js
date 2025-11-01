class FieldForcePro {
    constructor() {
        this.currentEmployee = null;
        this.locationWatchId = null;
        this.autoLocationInterval = null;
        this.lastLocation = null;
        this.isTracking = false;
        this.currentEmergencyType = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
        this.setDefaultDates();
        this.loadEmergencyContacts();
    }

    setupEventListeners() {
        // Auth events
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('showRegister').addEventListener('click', () => this.showScreen('registerScreen'));
        document.getElementById('showLogin').addEventListener('click', () => this.showScreen('loginScreen'));
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Tab events
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Task events
        document.getElementById('taskForm')?.addEventListener('submit', (e) => this.addTask(e));
        document.getElementById('progressForm').addEventListener('submit', (e) => this.updateProgress(e));
        document.getElementById('taskFilter').addEventListener('change', () => this.loadTasks());

        // Location events
        document.getElementById('startTracking')?.addEventListener('click', () => this.startLocationTracking());

        // Report events
        document.getElementById('generateReport').addEventListener('click', () => this.generateWeeklyReport());
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('cleanupData').addEventListener('click', () => this.cleanupData());

        // Modal events
        document.querySelectorAll('.close').forEach(close => {
            close.addEventListener('click', () => this.closeModals());
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModals();
            }
        });
    }

    setDefaultDates() {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        // Set default dates for benefits
        document.getElementById('mileageStartDate').value = firstDay.toISOString().split('T')[0];
        document.getElementById('mileageEndDate').value = lastDay.toISOString().split('T')[0];
        document.getElementById('timesheetStartDate').value = firstDay.toISOString().split('T')[0];
        document.getElementById('timesheetEndDate').value = lastDay.toISOString().split('T')[0];
        
        // Set weekly report dates (current week)
        const weekStart = new Date(today.setDate(today.getDate() - today.getDay() + 1));
        const weekEnd = new Date(today.setDate(today.getDate() - today.getDay() + 7));
        document.getElementById('weekStart').value = weekStart.toISOString().split('T')[0];
        document.getElementById('weekEnd').value = weekEnd.toISOString().split('T')[0];
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        this.showLoading(true);
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                this.currentEmployee = await response.json();
                localStorage.setItem('employee', JSON.stringify(this.currentEmployee));
                this.showDashboard();
                this.showNotification('Welcome to FieldForce Pro!', 'success');
                this.startLocationTracking(); // Auto-start for safety
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Network error - check console', 'error');
        }
        this.showLoading(false);
    }

    async handleRegister(e) {
        e.preventDefault();
        const formData = {
            name: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPassword').value
        };

        this.showLoading(true);
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                this.showNotification('Account created! Please login.', 'success');
                this.showScreen('loginScreen');
                document.getElementById('registerForm').reset();
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showNotification('Network error', 'error');
        }
        this.showLoading(false);
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showDashboard() {
        this.showScreen('dashboard');
        document.getElementById('userWelcome').textContent = `Welcome, ${this.currentEmployee.name}!`;
        this.updateDashboardMetrics();
        this.loadTasks();
    }

    logout() {
        this.currentEmployee = null;
        localStorage.removeItem('employee');
        this.stopLocationTracking();
        this.showScreen('loginScreen');
        this.showNotification('Logged out successfully', 'success');
    }

    checkAuth() {
        const savedEmployee = localStorage.getItem('employee');
        if (savedEmployee) {
            this.currentEmployee = JSON.parse(savedEmployee);
            this.showDashboard();
        }
    }

    // ==================== DASHBOARD METRICS ====================
    async updateDashboardMetrics() {
        try {
            // Update earnings
            const earnings = await this.calculateCurrentEarnings();
            document.getElementById('earningsMetric').textContent = earnings;
            
            // Update time saved
            const timeSaved = await this.calculateTimeSaved();
            document.getElementById('timeSavedMetric').textContent = timeSaved;
            
            // Update tasks completed
            const tasks = await this.loadTasksData();
            const completedCount = tasks.filter(t => t.status === 'completed').length;
            document.getElementById('tasksCompletedMetric').textContent = completedCount;
            
            // Update performance
            const performance = await this.calculatePerformance();
            document.getElementById('performanceMetric').textContent = performance;
            
            // Update benefit banners
            document.getElementById('mileageDisplay').textContent = earnings;
            document.getElementById('timeSavedDisplay').textContent = timeSaved + ' saved';
            
        } catch (error) {
            console.error('Error updating metrics:', error);
        }
    }

    async calculateCurrentEarnings() {
        const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        
        try {
            const response = await fetch(`/api/mileage/${this.currentEmployee.id}?startDate=${firstDay.toISOString()}&endDate=${lastDay.toISOString()}`);
            const data = await response.json();
            return data.reimbursement || '$0.00';
        } catch (error) {
            return '$0.00';
        }
    }

    async calculateTimeSaved() {
        try {
            const response = await fetch(`/api/time-savings/${this.currentEmployee.id}`);
            const data = await response.json();
            return data.timeSaved + ' hours' || '0 hours';
        } catch (error) {
            return '0 hours';
        }
    }

    async calculatePerformance() {
        const tasks = await this.loadTasksData();
        if (tasks.length === 0) return '0%';
        
        const completed = tasks.filter(t => t.status === 'completed').length;
        return Math.round((completed / tasks.length) * 100) + '%';
    }

    // ==================== TASK MANAGEMENT ====================
    async loadTasks() {
        try {
            const tasks = await this.loadTasksData();
            this.displayTasks(tasks);
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showNotification('Error loading tasks', 'error');
        }
    }

    async loadTasksData() {
        const response = await fetch(`/api/tasks/${this.currentEmployee.id}`);
        return await response.json();
    }

    displayTasks(tasks) {
        const container = document.getElementById('tasksList');
        const filter = document.getElementById('taskFilter').value;
        
        let filteredTasks = tasks;
        if (filter !== 'all') {
            filteredTasks = tasks.filter(task => task.status === filter);
        }

        if (filteredTasks.length === 0) {
            container.innerHTML = '<div class="task-item"><p>No tasks found. Check back later!</p></div>';
            return;
        }

        container.innerHTML = '';
        filteredTasks.forEach(task => {
            const priorityClass = `task-priority-${task.priority === 3 ? 'high' : task.priority === 2 ? 'medium' : 'low'}`;
            const statusClass = `status-${task.status.replace('_', '-')}`;
            
            const taskEl = document.createElement('div');
            taskEl.className = `task-item ${priorityClass}`;
            taskEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 15px;">
                    <div style="flex: 1;">
                        <h4>${task.title}</h4>
                        <p><strong>Customer:</strong> ${task.customer_name} | 📞 ${task.customer_phone || 'N/A'}</p>
                        <p><strong>Address:</strong> ${task.address}</p>
                        <p><strong>Due:</strong> ${new Date(task.due_date).toLocaleDateString()} | ⏱️ ${task.estimated_hours || 'N/A'}h estimated</p>
                        <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${task.status.replace('_', ' ').toUpperCase()}</span></p>
                        ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}
                    </div>
                    <button onclick="tracker.openTaskModal('${task._id}')">Update Progress</button>
                </div>
            `;
            container.appendChild(taskEl);
        });
    }

    async addTask(e) {
        e.preventDefault();
        // Implementation for managers to add tasks
        this.showNotification('Task creation available in manager mode', 'info');
    }

    openTaskModal(taskId) {
        document.getElementById('currentTaskId').value = taskId;
        document.getElementById('taskModal').style.display = 'block';
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    async updateProgress(e) {
        e.preventDefault();
        const progressData = {
            task_id: document.getElementById('currentTaskId').value,
            employee_id: this.currentEmployee.id,
            action: document.getElementById('progressAction').value,
            notes: document.getElementById('progressNotes').value,
            actual_hours: parseFloat(document.getElementById('actualHours').value) || 0,
            location_lat: this.lastLocation?.lat,
            location_lng: this.lastLocation?.lng
        };

        this.showLoading(true);
        try {
            const response = await fetch('/api/task-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(progressData)
            });

            if (response.ok) {
                this.showNotification('Progress updated successfully!', 'success');
                this.closeModals();
                this.loadTasks();
                this.updateDashboardMetrics();
                document.getElementById('progressForm').reset();
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Error updating progress', 'error');
            }
        } catch (error) {
            console.error('Error updating progress:', error);
            this.showNotification('Network error', 'error');
        }
        this.showLoading(false);
    }

    // ==================== SMART ROUTES ====================
    async loadAIPriority() {
        try {
            const response = await fetch(`/api/prioritized-tasks/${this.currentEmployee.id}`);
            const tasks = await response.json();
            this.displayPriorityTasks(tasks);
            this.calculateRouteSavings(tasks);
        } catch (error) {
            console.error('Error loading AI priority:', error);
            this.showNotification('Error loading smart routes', 'error');
        }
    }

    displayPriorityTasks(tasks) {
        const container = document.getElementById('priorityList');
        
        if (tasks.length === 0) {
            container.innerHTML = '<div class="task-item"><p>No tasks to optimize. Complete your current tasks!</p></div>';
            return;
        }

        container.innerHTML = '<h4>🎯 AI-Optimized Route Order:</h4>';
        tasks.forEach((task, index) => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item';
            taskEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="background: #007bff; color: white; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">
                        ${index + 1}
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1rem;">${task.title}</strong>
                        <p>📍 ${task.address}</p>
                        <p>📅 Due: ${new Date(task.due_date).toLocaleDateString()}</p>
                        <p>🎯 Priority: ${task.priority === 3 ? 'High' : task.priority === 2 ? 'Medium' : 'Low'}</p>
                        <p style="color: #28a745; font-weight: 500;">AI Score: ${task.ai_score?.toFixed(1) || 'N/A'}</p>
                    </div>
                </div>
            `;
            container.appendChild(taskEl);
        });
    }

    calculateRouteSavings(tasks) {
        // Simulate time and fuel savings
        const timeSaved = (tasks.length * 12.5).toFixed(0); // 12.5 minutes per task saved
        const fuelSaved = (tasks.length * 2.35).toFixed(2); // $2.35 per task saved
        
        document.getElementById('timeSavedStat').textContent = timeSaved + ' min';
        document.getElementById('fuelSavedStat').textContent = '$' + fuelSaved;
    }

    // ==================== BENEFITS FEATURES ====================
    async calculateMileage() {
        const startDate = document.getElementById('mileageStartDate').value;
        const endDate = document.getElementById('mileageEndDate').value;

        if (!startDate || !endDate) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/mileage/${this.currentEmployee.id}?startDate=${startDate}&endDate=${endDate}`);
            const data = await response.json();
            
            document.getElementById('mileageResults').innerHTML = `
                <div style="text-align: center;">
                    <h3 style="color: #28a745; margin-bottom: 10px;">💰 $${data.reimbursement}</h3>
                    <p><strong>Mileage Reimbursement</strong></p>
                    <p>You drove ${data.totalMiles} miles during this period</p>
                    <p><small>${data.period}</small></p>
                    <p style="color: #007bff; font-weight: 500;">✅ Automatically calculated from your location data</p>
                </div>
            `;
            
        } catch (error) {
            console.error('Error calculating mileage:', error);
            this.showNotification('Error calculating mileage', 'error');
        }
        this.showLoading(false);
    }

    async calculateTimesheet() {
        const startDate = document.getElementById('timesheetStartDate').value;
        const endDate = document.getElementById('timesheetEndDate').value;

        if (!startDate || !endDate) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/timesheet/${this.currentEmployee.id}?startDate=${startDate}&endDate=${endDate}`);
            const data = await response.json();
            
            document.getElementById('timesheetResults').innerHTML = `
                <div style="text-align: center;">
                    <h3 style="color: #007bff; margin-bottom: 15px;">${data.totalPay} Total Pay</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left;">
                        <div>
                            <p><strong>Regular Hours:</strong> ${data.regularHours}h</p>
                            <p><strong>Overtime Hours:</strong> ${data.overtime}h</p>
                        </div>
                        <div>
                            <p><strong>Regular Pay:</strong> ${data.regularPay}</p>
                            <p><strong>Overtime Pay:</strong> ${data.overtimePay}</p>
                        </div>
                    </div>
                    <p><small>${data.period}</small></p>
                    <p style="color: #28a745; font-weight: 500;">✅ Automatically tracked from task completion</p>
                </div>
            `;
            
        } catch (error) {
            console.error('Error calculating timesheet:', error);
            this.showNotification('Error calculating timesheet', 'error');
        }
        this.showLoading(false);
    }

    // ==================== SAFETY & EMERGENCY FEATURES ====================
    async loadEmergencyContacts() {
        try {
            const response = await fetch('/api/emergency-contacts');
            const contacts = await response.json();
            this.displayEmergencyContacts(contacts);
        } catch (error) {
            console.error('Error loading emergency contacts:', error);
        }
    }

    displayEmergencyContacts(contacts) {
        const container = document.getElementById('emergencyContactsList');
        container.innerHTML = contacts.map(contact => `
            <div class="contact-card">
                <div>
                    <strong>${contact.name}</strong>
                    <p>${contact.role}</p>
                    <p style="color: #007bff; font-weight: 500;">${contact.phone}</p>
                </div>
                <button onclick="tracker.callNumber('${contact.phone}')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;">
                    📞 Call
                </button>
            </div>
        `).join('');
    }

    triggerEmergency(type) {
        this.currentEmergencyType = type;
        const typeNames = {
            'medical': '🏥 Medical Emergency',
            'accident': '🚗 Accident Report', 
            'safety_concern': '⚠️ Safety Concern'
        };
        
        document.getElementById('emergencyTypeDisplay').textContent = typeNames[type];
        document.getElementById('emergencyModal').style.display = 'block';
    }

    async sendEmergencyAlert() {
        const message = document.getElementById('emergencyMessage').value;
        
        if (!message.trim()) {
            this.showNotification('Please describe the emergency', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch('/api/emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: this.currentEmployee.id,
                    employee_name: this.currentEmployee.name,
                    emergency_type: this.currentEmergencyType,
                    message: message,
                    location: this.lastLocation
                })
            });

            if (response.ok) {
                this.showNotification('🚨 EMERGENCY ALERT SENT! Help is on the way!', 'success');
                this.closeModals();
                document.getElementById('emergencyMessage').value = '';
                
                // Auto-call primary emergency contact
                this.callNumber('+1234567890');
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Error sending alert', 'error');
            }
        } catch (error) {
            console.error('Error sending emergency:', error);
            this.showNotification('Network error - try calling directly', 'error');
        }
        this.showLoading(false);
    }

    callNumber(phone) {
        window.open(`tel:${phone}`, '_self');
    }

    // ==================== LOCATION TRACKING ====================
    startLocationTracking() {
        if (!navigator.geolocation) {
            this.showNotification('Geolocation is not supported by this browser.', 'error');
            return;
        }

        this.isTracking = true;
        
        // Get immediate location
        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.updateLocation(position, false);
            },
            (error) => {
                console.error('Error getting location:', error);
                this.showNotification('Location access denied. Please enable location services for safety features.', 'error');
            }
        );

        // Watch for location changes
        this.locationWatchId = navigator.geolocation.watchPosition(
            (position) => {
                this.updateLocation(position, true);
            },
            (error) => {
                console.error('Location watch error:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );

        // Auto-log location every hour for safety
        this.autoLocationInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.updateLocation(position, true);
                },
                (error) => {
                    console.error('Auto-location error:', error);
                }
            );
        }, 3600000); // 1 hour

        document.getElementById('safetyStatus').textContent = '🟢 Active';
        this.showNotification('📍 Location tracking active - Safety features enabled!', 'success');
    }

    stopLocationTracking() {
        if (this.locationWatchId) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }
        if (this.autoLocationInterval) {
            clearInterval(this.autoLocationInterval);
            this.autoLocationInterval = null;
        }
        
        this.isTracking = false;
        document.getElementById('safetyStatus').textContent = '🔴 Inactive';
        this.showNotification('Location tracking stopped', 'warning');
    }

    async updateLocation(position, isAuto = false) {
        this.lastLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
        };

        // Update safety status
        document.getElementById('safetyStatus').innerHTML = '🟢 Active<br><small>Location shared</small>';

        // Send to server for mileage tracking and safety
        try {
            await fetch('/api/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: this.currentEmployee.id,
                    latitude: this.lastLocation.lat,
                    longitude: this.lastLocation.lng,
                    accuracy: this.lastLocation.accuracy,
                    battery_level: null // Could be added if needed
                })
            });
            
            if (isAuto) {
                console.log('📍 Auto-location logged for safety & mileage');
            }
        } catch (error) {
            console.error('Error updating location:', error);
        }
    }

    // ==================== REPORTS & EXPORT ====================
    async generateWeeklyReport() {
        const weekStart = document.getElementById('weekStart').value;
        const weekEnd = document.getElementById('weekEnd').value;

        if (!weekStart || !weekEnd) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/export/weekly-report?week_start=${weekStart}&week_end=${weekEnd}`);
            const report = await response.json();

            this.displayReportResults(report);
            this.showNotification('Weekly report generated!', 'success');
        } catch (error) {
            console.error('Error generating report:', error);
            this.showNotification('Error generating report', 'error');
        }
        this.showLoading(false);
    }

    displayReportResults(report) {
        const container = document.getElementById('reportResults');
        const stats = report.weekly_report;

        container.innerHTML = `
            <div class="task-item">
                <h4>📊 Weekly Report Summary (${stats.week_number})</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #007bff;">${stats.total_employees}</div>
                        <div>Employees</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;">${stats.total_tasks}</div>
                        <div>Total Tasks</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #17a2b8;">${stats.completed_tasks}</div>
                        <div>Completed</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #ffc107;">${stats.total_mileage}</div>
                        <div>Total Miles</div>
                    </div>
                </div>
                <p><strong>Generated:</strong> ${new Date(stats.generated_at).toLocaleString()}</p>
            </div>
        `;
    }

    async exportData() {
        const weekStart = document.getElementById('weekStart').value;
        const weekEnd = document.getElementById('weekEnd').value;

        if (!weekStart || !weekEnd) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/export/weekly-report?week_start=${weekStart}&week_end=${weekEnd}`);
            const report = await response.json();

            this.displayExportResults(report.files);
            this.showNotification('Data exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification('Error exporting data', 'error');
        }
        this.showLoading(false);
    }

    displayExportResults(files) {
        const container = document.getElementById('exportResults');
        
        container.innerHTML = `
            <div class="task-item">
                <h4>📥 Export Results - Ready for Download</h4>
                <p>Copy data or use download buttons:</p>
                
                <div style="margin-top: 20px;">
                    <h5>📋 Tasks Data (${files.tasks.split('\n').length - 1} records)</h5>
                    <div class="csv-data">${files.tasks}</div>
                    <button class="download-btn" onclick="tracker.downloadCSV('${this.escapeCSV(files.tasks)}', 'tasks.csv')">
                        📥 Download Tasks CSV
                    </button>
                </div>
                
                <div style="margin-top: 20px;">
                    <h5>📍 Locations Data (${files.locations.split('\n').length - 1} records)</h5>
                    <div class="csv-data">${files.locations}</div>
                    <button class="download-btn" onclick="tracker.downloadCSV('${this.escapeCSV(files.locations)}', 'locations.csv')">
                        📥 Download Locations CSV
                    </button>
                </div>
                
                <div style="margin-top: 20px;">
                    <h5>📊 Activity Logs (${files.logs.split('\n').length - 1} records)</h5>
                    <div class="csv-data">${files.logs}</div>
                    <button class="download-btn" onclick="tracker.downloadCSV('${this.escapeCSV(files.logs)}', 'activity_logs.csv')">
                        📥 Download Logs CSV
                    </button>
                </div>
            </div>
        `;
    }

    escapeCSV(text) {
        return text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
    }

    downloadCSV(csvData, filename) {
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.showNotification(`Downloaded: ${filename}`, 'success');
    }

    async cleanupData() {
        const weekStart = document.getElementById('weekStart').value;
        const weekEnd = document.getElementById('weekEnd').value;

        if (!weekStart || !weekEnd) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        const confirmed = confirm('⚠️ WARNING: This will DELETE all data for the selected week after backup. Are you sure you want to continue?');
        if (!confirmed) return;

        this.showLoading(true);
        try {
            const response = await fetch('/api/cleanup/weekly-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    week_start: weekStart,
                    week_end: weekEnd,
                    backup_confirmed: true
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                this.showNotification(`Cleanup completed! Deleted: ${result.deleted.tasks} tasks, ${result.deleted.locations} locations, ${result.deleted.logs} logs`, 'success');
            } else {
                this.showNotification(result.error || 'Cleanup failed', 'error');
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
            this.showNotification('Error during cleanup', 'error');
        }
        this.showLoading(false);
    }

    // ==================== TAB MANAGEMENT ====================
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        switch(tabName) {
            case 'ai-priority':
                this.loadAIPriority();
                break;
            case 'dashboard-tab':
                this.updateDashboardMetrics();
                break;
            case 'benefits':
                // Benefits tab is already loaded
                break;
            case 'safety':
                // Safety tab is already loaded
                break;
        }
    }

    // ==================== UTILITY FUNCTIONS ====================
    showLoading(show) {
        const app = document.getElementById('app');
        if (show) {
            app.classList.add('loading');
        } else {
            app.classList.remove('loading');
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 18px;">
                    ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Add CSS for notifications
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .status-badge {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
        display: inline-block;
    }
    
    .status-pending { background: #fff3cd; color: #856404; }
    .status-in-progress { background: #cce7ff; color: #004085; }
    .status-completed { background: #d4edda; color: #155724; }
`;
document.head.appendChild(notificationStyles);

// Initialize the application
const tracker = new FieldForcePro();

// PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('FieldForce Pro PWA registered');
            })
            .catch(error => {
                console.log('PWA registration failed: ', error);
            });
    });
}

// Add to Home Screen prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    
    // Show install prompt after 10 seconds
    setTimeout(() => {
        const installPrompt = document.createElement('div');
        installPrompt.className = 'notification info';
        installPrompt.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                <span>📱 Install FieldForce Pro for better experience?</span>
                <button onclick="this.parentElement.parentElement.remove(); tracker.installPWA();" 
                        style="background: white; color: #007bff; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">
                    Install
                </button>
            </div>
        `;
        document.body.appendChild(installPrompt);
    }, 10000);
});

// Install PWA
tracker.installPWA = async function() {
    if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        window.deferredPrompt = null;
    }
};