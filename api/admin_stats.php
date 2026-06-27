<?php
require_once __DIR__ . '/config.php';
handleOptions();
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

try {
    $pdo = getDB();

    $totalCandidates = (int) $pdo->query(
        "SELECT COUNT(*) FROM users WHERE role = 'employee'"
    )->fetchColumn();

    $passStats = $pdo->query(
        "SELECT
            COUNT(*) AS total_exams,
            SUM(CASE WHEN passing_status = 'Passed' THEN 1 ELSE 0 END) AS passed,
            SUM(CASE WHEN passing_status = 'Failed' THEN 1 ELSE 0 END) AS failed
         FROM exam_results"
    )->fetch();

    $totalExams = (int) ($passStats['total_exams'] ?? 0);
    $passed = (int) ($passStats['passed'] ?? 0);
    $failed = (int) ($passStats['failed'] ?? 0);
    $passRate = $totalExams > 0 ? round(($passed / $totalExams) * 100, 1) : 0;

    $activeQuestions = (int) $pdo->query('SELECT COUNT(*) FROM questions')->fetchColumn();

    $specialtyStmt = $pdo->query(
        "SELECT specialty, COUNT(*) AS count FROM users WHERE role = 'employee' GROUP BY specialty ORDER BY count DESC"
    );
    $specialtyBreakdown = $specialtyStmt->fetchAll();

    jsonResponse([
        'success' => true,
        'metrics' => [
            'total_candidates' => $totalCandidates,
            'pass_rate' => $passRate,
            'active_questions' => $activeQuestions,
            'total_exams' => $totalExams,
            'passed' => $passed,
            'failed' => $failed,
            'specialty_breakdown' => $specialtyBreakdown,
        ],
    ]);
} catch (PDOException $e) {
    jsonError('Failed to load stats: ' . $e->getMessage(), 500);
}
