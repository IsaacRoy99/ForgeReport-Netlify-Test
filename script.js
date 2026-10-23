// ======================================================
// LOGIN PROTECTION
// ======================================================

const currentPage = window.location.pathname;

if (
    (currentPage.endsWith("index.html") || currentPage.endsWith("/")) &&
    sessionStorage.getItem("loggedIn") !== "true"
) {
    window.location.href = "login.html";
}


// ======================================================
// STATUS BADGES
// ======================================================

function getStatusBadge(status) {

    if (status === "Completed")
        return "success";

    if (status === "Blocked")
        return "danger";

    if (status === "On Hold")
        return "warning";

    return "primary";
}

function getReviewBadge(status) {

    if (status === "Approved")
        return "success";

    if (status === "Rejected")
        return "danger";

    return "warning";
}


// ======================================================
// LOGIN
// ======================================================

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function (e) {

        e.preventDefault();

        const email = document
            .querySelector("#loginForm input[type='email']")
            .value
            .trim();

        const password = document
            .querySelector("#loginForm input[type='password']")
            .value
            .trim();

        if (email === "" || password === "") {

            Swal.fire({
                title: "Missing Information",
                text: "Please enter your email and password.",
                icon: "error",
                confirmButtonColor: "#d33"
            });

            return;
        }

        try {

            const response = await fetch(`${API_URL}/Auth/login`, {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {

                Swal.fire({
                    title: "Login Failed",
                    text: data.message || "Invalid login details.",
                    icon: "error",
                    confirmButtonColor: "#d33"
                });

                return;
            }

            // Save authenticated session
            sessionStorage.setItem("authToken", data.token);
            sessionStorage.setItem("loggedIn", "true");
            sessionStorage.setItem("userId", data.user.id);
            sessionStorage.setItem("userName", data.user.name);
            sessionStorage.setItem("userEmail", data.user.email);
            sessionStorage.setItem("userRole", data.user.role);
            sessionStorage.setItem("departmentId", data.user.departmentId);
            sessionStorage.setItem("department", data.user.department);
            sessionStorage.setItem("site", data.user.site);

            // Admin goes to admin dashboard
            if (data.user.role === "Admin") {

                window.location.href = "admin.html";

            } else {

                window.location.href = "index.html";
            }

        } catch (error) {

            console.error(error);

            Swal.fire({
                title: "Connection Error",
                text: "Could not connect to the reporting server. Make sure the API is running.",
                icon: "error",
                confirmButtonColor: "#d33"
            });
        }
    });
}


// ======================================================
// SIGNUP
// ======================================================

const signupForm = document.getElementById("signupForm");
if (signupForm) {
    const departmentSelect = document.getElementById("signupDepartment");
    if (departmentSelect) {
        fetch(`${API_URL}/Auth/departments`).then(r => r.json()).then(departments => {
            departmentSelect.innerHTML = '<option value="">Select department</option>' + departments.map(d => `<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(d.site)}</option>`).join('');
        }).catch(() => { departmentSelect.innerHTML = '<option value="">Departments unavailable</option>'; });
    }
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fields = signupForm.querySelectorAll('input');
        const fullName = fields[0]?.value.trim() || '';
        const email = fields[1]?.value.trim() || '';
        const password = fields[2]?.value || '';
        const departmentId = departmentSelect?.value || '';
        if (!fullName || !email || !password || !departmentId) {
            Swal.fire({ title: 'Missing Information', text: 'Complete all fields and select your department.', icon: 'error' }); return;
        }
        if (password.length < 8) { Swal.fire({ title: 'Password Too Short', text: 'Use at least 8 characters.', icon: 'warning' }); return; }
        try {
            const response = await fetch(`${API_URL}/Auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, email, password, departmentId }) });
            const data = await response.json();
            if (!response.ok) { Swal.fire({ title: 'Could Not Create Account', text: data.message || 'Please try again.', icon: 'error' }); return; }
            await Swal.fire({ title: 'Account Created', text: 'Your account is ready. You can now log in.', icon: 'success' });
            window.location.href = 'login.html';
        } catch (error) { console.error(error); Swal.fire({ title: 'Connection Error', text: 'Could not reach the server. Check the Netlify/Supabase setup.', icon: 'error' }); }
    });
}

// ======================================================
// REPORT FORM
// ======================================================

const reportForm = document.getElementById("reportForm");

if (reportForm) {

    reportForm.addEventListener("submit", async function (e) {

        e.preventDefault();

        const title = document.getElementById("reportTitle").value.trim();
        const team = document.getElementById("team").value.trim();
        const status = document.getElementById("status").value.trim();

        const textareas = document.querySelectorAll("#reportForm textarea");

        const summary = textareas[0]?.value.trim() || "";
        const challenges = textareas[1]?.value.trim() || "";
        const progress = textareas[2]?.value.trim() || "";

        const dateInput = document.querySelector("#reportForm input[type='date']");

        const dueDate =
            dateInput?.value ||
            new Date().toISOString().split("T")[0];

        const importanceElement =
            document.getElementById("importance");

        const importance =
            importanceElement?.value || "Important";

        // attach file  
        const attachmentFile = document.getElementById("attachmentFile")?.files[0];  

        // Validate form
        if (
            title === "" ||
            team === "" ||
            status === "" ||
            summary === "" ||
            challenges === "" ||
            progress === ""
        ) {
            Swal.fire({
                title: "Missing Information",
                text: "Please complete all required fields before submitting.",
                icon: "error",
                confirmButtonColor: "#d33"
            });

            return;
        }

        const userId =
            sessionStorage.getItem("userId");

        const departmentId =
            Number(sessionStorage.getItem("departmentId"));

        if (!userId || !departmentId) {

            Swal.fire({
                title: "Session Error",
                text: "Please log in again.",
                icon: "error"
            });

            return;
        }

        // Report data
        const report = {
            projectTitle: title,
            departmentId: departmentId,
            submittedById: userId,
            projectStatus: status,
            projectSummary: summary,
            challenges: challenges,
            nextSteps: progress,
            importance: importance,
            dueDate: dueDate,
            reportingDate: new Date().toISOString(),
            reviewStatus: "Pending"
        };

        const editingReportId =
            reportForm.dataset.editingReportId;

        try {

            let response;

            // Resubmitting rejected report
            if (editingReportId) {

                response = await fetch(
                    `${API_URL}/Reports/${editingReportId}/resubmit`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(report)
                    }
                );

            } else {

                // Creating new report
                response = await fetch(
                    `${API_URL}/Reports`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(report)
                    }
                );
            }

            const data = await response.json();

            if (!response.ok) {

                Swal.fire({
                    title: editingReportId
                        ? "Resubmission Failed"
                        : "Submission Failed",

                    text: data.message ||
                        "Could not submit the report.",

                    icon: "error"
                });

                return;
            }

            // Upload attachment if a file was selected
if (attachmentFile) {

    const reportId = editingReportId || data.reportId;

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read the attachment."));
        reader.readAsDataURL(attachmentFile);
    });

    const uploadResponse = await fetch(
        `${API_URL}/Reports/${reportId}/attachment`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: attachmentFile.name, contentType: attachmentFile.type, base64 })
        }
    );

    if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.json();

        Swal.fire({
            title: "Attachment Upload Failed",
            text: uploadError.message || "The report was saved, but its attachment could not be uploaded.",
            icon: "error"
        });

        return;
    }
}

            // Success message
            if (editingReportId) {

                Swal.fire({
                    title: "Report Resubmitted!",
                    html:
                        `<b>Your report has been updated and resubmitted for review.</b>
                        <br><br>
                        Report #${editingReportId}`,

                    icon: "success",
                    confirmButtonText: "Close",
                    confirmButtonColor: "#fca311",
                    allowOutsideClick: false
                });

            } else {

                Swal.fire({
                    title: "Report Submitted!",
                    html:
                        `<b>Your department report was submitted successfully.</b>
                        <br><br>
                        Report #${data.reportId}
                        <br><br>
                        The report has been forwarded for managerial review.`,

                    icon: "success",
                    confirmButtonText: "Close",
                    confirmButtonColor: "#fca311",
                    allowOutsideClick: false
                });
            }

            // Exit edit mode
            delete reportForm.dataset.editingReportId;

            // Reset form
            reportForm.reset();

            // Restore submit button
            const submitButton =
                document.getElementById("submitBtn");

            submitButton.innerHTML = "Submit Report";

            submitButton.classList.remove("btn-success");
            submitButton.classList.add("btn-warning");

            // Refresh reports
            loadReports();
            updateStats();

        } catch (error) {

            console.error(error);

            Swal.fire({
                title: "Connection Error",
                text: "Could not connect to the reporting server.",
                icon: "error"
            });
        }
    });
}

// ======================================================
// LOAD DEPARTMENT HEAD REPORTS
// ======================================================

async function loadReports() {

    const table =
        document.getElementById("reportTable");

    if (!table)
        return;

    const userId =
        sessionStorage.getItem("userId");

    if (!userId)
        return;

    try {

        const response =
            await fetch(`${API_URL}/Reports/user/${userId}`);

        const reports =
            await response.json();

        table.innerHTML = "";

        if (reports.length === 0) {

            table.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-4">
                        No reports submitted yet.
                    </td>
                </tr>
            `;

            return;
        }

        reports.forEach(report => {

            let actionButton = "";

                if (report.reviewStatus === "Rejected") {
                    actionButton = `
                        <button
                            class="btn btn-sm btn-warning fw-semibold"
                            onclick="editRejectedReport(${report.id})">
                            <i class="fa-solid fa-pen-to-square me-1"></i>
                            Edit & Resubmit
                        </button>
        `           ;
                } else if (report.reviewStatus === "Approved") {
                    actionButton = `
                        <span class="text-success fw-semibold">
                            <i class="fa-solid fa-circle-check me-1"></i>
                            Approved
                        </span>
                    `;
                } else {
                    actionButton = `
                        <span class="text-muted">
                            <i class="fa-solid fa-clock me-1"></i>
                            Awaiting Review
                        </span>
                    `;
                }

    table.innerHTML += `
        <tr>
            <td>
                <strong>${escapeHtml(report.projectTitle)}</strong>
            </td>

            <td>
                ${escapeHtml(report.department)}
            </td>

            <td>
                <span class="badge bg-${getStatusBadge(report.projectStatus)}">
                    ${escapeHtml(report.projectStatus)}
                </span>
            </td>

            <td>
                <span class="badge bg-${getReviewBadge(report.reviewStatus)}">
                    ${escapeHtml(report.reviewStatus)}
                </span>

                ${
                    report.adminFeedback
                    ? `<br>
                       <small class="text-muted">
                           Feedback: ${escapeHtml(report.adminFeedback)}
                       </small>`
                    : ""
                }
            </td>

            <td>
                ${actionButton}
            </td>
        </tr>
    `;
});

    } catch (error) {

        console.error("Could not load reports:", error);
    }
}


// ======================================================
// DASHBOARD STATS
// ======================================================

async function updateStats() {

    const submitted =
        document.getElementById("reportsSubmitted");

    const pending =
        document.getElementById("pendingReviews");

    const approved =
        document.getElementById("approvedReports");

    if (!submitted || !pending || !approved)
        return;

    const userId =
        sessionStorage.getItem("userId");

    if (!userId)
        return;

    try {

        const response =
            await fetch(`${API_URL}/Reports/user/${userId}`);

        const reports =
            await response.json();

        submitted.textContent = reports.length;

        pending.textContent =
            reports.filter(r =>
                r.reviewStatus === "Pending"
            ).length;

        approved.textContent =
            reports.filter(r =>
                r.reviewStatus === "Approved"
            ).length;

    } catch (error) {

        console.error(error);
    }
}


// ======================================================
// SEARCH
// ======================================================

const searchInput =
    document.getElementById("searchInput");

if (searchInput) {

    searchInput.addEventListener("keyup", function () {

        const value =
            this.value.toLowerCase();

        const rows =
            document.querySelectorAll("#reportTable tr");

        rows.forEach(row => {

            const text =
                row.innerText.toLowerCase();

            row.style.display =
                text.includes(value)
                    ? ""
                    : "none";
        });
    });
}


// ======================================================
// SHOW CURRENT USER
// ======================================================

const userNameElements =
    document.querySelectorAll(".current-user-name");

userNameElements.forEach(element => {

    element.textContent =
        sessionStorage.getItem("userName") || "Department Head";
});


// ======================================================
// LOGOUT
// ======================================================

const logoutButton =
    document.getElementById("logoutButton");

if (logoutButton) {

    logoutButton.addEventListener("click", function () {

        sessionStorage.clear();

        window.location.href =
            "login.html";
    });
}


// ======================================================
// HTML SAFETY
// ======================================================

function escapeHtml(value) {

    if (!value)
        return "";

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Edit and resubmit a rejected report
async function editRejectedReport(reportId) {

    try {
        const userId = sessionStorage.getItem("userId");

        const response = await fetch(`${API_URL}/Reports/user/${userId}`);
        const reports = await response.json();

        const report = reports.find(r => r.id === reportId);

        if (!report) {
            Swal.fire({
                title: "Report Not Found",
                text: "Could not find the selected report.",
                icon: "error"
            });
            return;
        }

        if (report.reviewStatus !== "Rejected") {
            Swal.fire({
                title: "Cannot Edit",
                text: "Only rejected reports can be resubmitted.",
                icon: "warning"
            });
            return;
        }

        // Fill the existing report form
        document.getElementById("reportTitle").value = report.projectTitle;
        document.getElementById("status").value = report.projectStatus;
        document.getElementById("importance").value = report.importance;

        const textareas = document.querySelectorAll("#reportForm textarea");

        if (textareas[0]) {
            textareas[0].value = report.projectSummary;
        }

        if (textareas[1]) {
            textareas[1].value = report.challenges;
        }

        if (textareas[2]) {
            textareas[2].value = report.nextSteps;
        }

        // Change button into resubmit mode
        const submitButton = document.getElementById("submitBtn");

        submitButton.innerHTML = `
            <i class="fa-solid fa-paper-plane me-2"></i>
            Resubmit Report
        `;

        submitButton.classList.remove("btn-warning");
        submitButton.classList.add("btn-success");

        // Store the report ID so the submit handler knows this is an edit
        document.getElementById("reportForm").dataset.editingReportId = report.id;

        // Show rejection feedback
        Swal.fire({
            title: "Editing Rejected Report",
            html: `
                <p class="mb-2">
                    You can now update your report and resubmit it.
                </p>

                ${
                    report.adminFeedback
                    ? `<div class="alert alert-danger text-start">
                        <strong>Admin Feedback:</strong><br>
                        ${escapeHtml(report.adminFeedback)}
                       </div>`
                    : ""
                }
            `,
            icon: "info",
            confirmButtonText: "Edit Report",
            confirmButtonColor: "#fca311"
        });

        // Scroll back to form
        document.getElementById("reportForm").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {

        console.error(error);

        Swal.fire({
            title: "Connection Error",
            text: "Could not load the rejected report.",
            icon: "error"
        });
    }
}

// ======================================================
// INITIAL LOAD
// ======================================================

loadReports();
updateStats();