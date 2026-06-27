<?php
require_once __DIR__ . '/config.php';
handleOptions();
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

try {
    $pdo = getDB();
    $resultId = (int) ($_GET['result_id'] ?? 0);

    if ($resultId > 0) {
        $resultStmt = $pdo->prepare(
            'SELECT er.*, u.full_name, u.email, u.specialty
             FROM exam_results er
             JOIN users u ON u.id = er.user_id
             WHERE er.id = ?'
        );
        $resultStmt->execute([$resultId]);
        $result = $resultStmt->fetch();

        if (!$result) {
            jsonError('Exam result not found.', 404);
        }

        $historyStmt = $pdo->prepare(
            'SELECT h.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option
             FROM user_answers_history h
             JOIN questions q ON q.id = h.question_id
             WHERE h.exam_result_id = ?
             ORDER BY h.id ASC'
        );
        $historyStmt->execute([$resultId]);

        jsonResponse([
            'success' => true,
            'result' => $result,
            'answers' => $historyStmt->fetchAll(),
        ]);
    }

    $listStmt = $pdo->query(
        'SELECT er.id, er.total_score, er.percentage, er.passing_status, er.certificate_uuid,
                er.exam_date, er.disqualified, u.full_name, u.email, u.specialty,
                (SELECT COUNT(*) FROM questions q WHERE q.track =
                    CASE u.specialty
                        WHEN "Web Developer" THEN "Web Dev"
                        WHEN "Web Designer" THEN "Design"
                        WHEN "UI/UX Designer" THEN "UI/UX"
                        ELSE "General CS"
                    END
                ) AS total_questions
         FROM exam_results er
         JOIN users u ON u.id = er.user_id
         ORDER BY er.exam_date DESC'
    );

    jsonResponse(['success' => true, 'results' => $listStmt->fetchAll()]);
} catch (PDOException $e) {
    jsonError('Failed to load results: ' . $e->getMessage(), 500);
}
